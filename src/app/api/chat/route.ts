import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit, getSystemPrompt } from "@/lib/settings";
import { classifyQuestion } from "@/lib/ai/router";
import { anthropic, MODEL_COMPLEX, MODEL_SIMPLE } from "@/lib/ai/client";
import {
  MESSAGE_MAX_LENGTH,
  RATE_LIMIT_PER_MINUTE,
  getClientIp,
  refundQuestion,
  reserveQuestion,
  truncateForClassifier,
} from "@/lib/quota";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }
  const userId = session.user.id;

  const body = (await request.json().catch(() => null)) as
    | { conversationId?: string; message?: string }
    | null;
  const conversationId = body?.conversationId;
  const messageText = body?.message?.trim();

  if (!conversationId || !messageText) {
    return NextResponse.json(
      { error: "Brak treści pytania lub identyfikatora rozmowy." },
      { status: 400 },
    );
  }

  if (messageText.length > MESSAGE_MAX_LENGTH) {
    return NextResponse.json(
      {
        error:
          "Wiadomość jest za długa (maks. 50 000 znaków). Podziel ją na części.",
      },
      { status: 400 },
    );
  }

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: {
      messages: { orderBy: { createdAt: "asc" } },
      scrapedSources: { select: { status: true } },
    },
  });
  if (!conversation || conversation.userId !== userId) {
    return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
  }

  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const recentUserMessages = await prisma.message.count({
    where: {
      role: "user",
      createdAt: { gte: oneMinuteAgo },
      conversation: { userId },
    },
  });
  if (recentUserMessages >= RATE_LIMIT_PER_MINUTE) {
    return NextResponse.json(
      { error: "Za dużo pytań w krótkim czasie. Odczekaj minutę." },
      { status: 429 },
    );
  }

  const freeQuestionsLimit = await getFreeQuestionsLimit();
  const deviceId = (await cookies()).get("ag_device")?.value ?? null;
  const ip = getClientIp(request);

  const reservation = await reserveQuestion({
    userId,
    deviceId,
    ip,
    freeLimit: freeQuestionsLimit,
  });

  if (reservation === "no-quota") {
    return NextResponse.json(
      { error: "Wykorzystano limit pytań.", buyUrl: "/pakiety" },
      { status: 403 },
    );
  }
  if (reservation === "no-cookie") {
    return NextResponse.json(
      {
        error:
          "Darmowe pytania wymagają włączonych plików cookie. Włącz cookies albo kup pakiet.",
        buyUrl: "/pakiety",
      },
      { status: 403 },
    );
  }

  const systemPrompt = await getSystemPrompt();

  const isFirstMessage = conversation.messages.length === 0;

  await prisma.message.create({
    data: { conversationId, role: "user", content: messageText },
  });
  if (isFirstMessage) {
    await prisma.conversation.update({
      where: { id: conversationId },
      data: { title: messageText.slice(0, 60) },
    });
  }

  const history: Anthropic.MessageParam[] = conversation.messages.map((m) => ({
    role: m.role === "user" ? "user" : "assistant",
    content: m.content,
  }));

  const hasScrapedDocumentation = conversation.scrapedSources.some(
    (s) => s.status === "done",
  );

  const modelClass = hasScrapedDocumentation
    ? ("COMPLEX" as const)
    : await classifyQuestion(
        truncateForClassifier(messageText),
        conversation.messages.map((m) => ({
          role: m.role === "user" ? ("user" as const) : ("assistant" as const),
          content: truncateForClassifier(m.content),
        })),
      );

  const model = modelClass === "SIMPLE" ? MODEL_SIMPLE : MODEL_COMPLEX;
  const maxTokens = modelClass === "SIMPLE" ? 2048 : 64000;

  const stream = anthropic.messages.stream({
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
    messages: [...history, { role: "user", content: messageText }],
    ...(modelClass === "COMPLEX" ? { thinking: { type: "adaptive" as const } } : {}),
  });

  const encoder = new TextEncoder();

  const responseBody = new ReadableStream<Uint8Array>({
    async start(controller) {
      let responseText = "";
      let streamedAnything = false;

      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            streamedAnything = true;
            responseText += event.delta.text;
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const finalMessage = await stream.finalMessage();
        const isRefusal = finalMessage.stop_reason === "refusal";

        try {
          await prisma.message.create({
            data: {
              conversationId,
              role: "assistant",
              content: responseText,
              modelUsed: model,
              inputTokens: finalMessage.usage.input_tokens,
              outputTokens: finalMessage.usage.output_tokens,
            },
          });
          await prisma.conversation.update({
            where: { id: conversationId },
            data: { updatedAt: new Date() },
          });
        } catch (dbError) {
          console.error("Błąd zapisu odpowiedzi asystenta:", dbError);
        }

        if (isRefusal) {
          await refundQuestion({ userId, deviceId, ip, kind: reservation });
        }
      } catch (error) {
        if (!streamedAnything) {
          controller.enqueue(
            encoder.encode("Chwilowe przeciążenie, spróbuj za minutę."),
          );
          await refundQuestion({ userId, deviceId, ip, kind: reservation }).catch(
            (refundError) => console.error("Błąd zwrotu pytania:", refundError),
          );
        } else {
          controller.enqueue(
            encoder.encode(
              "\n\n[Odpowiedź została przerwana — możesz zadać pytanie ponownie.]",
            ),
          );
          try {
            await prisma.message.create({
              data: {
                conversationId,
                role: "assistant",
                content: responseText,
                modelUsed: model,
              },
            });
          } catch (dbError) {
            console.error("Błąd zapisu częściowej odpowiedzi:", dbError);
          }
        }
        console.error("Błąd streamu czatu:", error);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(responseBody, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
