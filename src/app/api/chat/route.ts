import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit, getSystemPrompt } from "@/lib/settings";
import { classifyQuestion } from "@/lib/ai/router";
import { anthropic, MODEL_COMPLEX, MODEL_SIMPLE } from "@/lib/ai/client";

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

  const conversation = await prisma.conversation.findUnique({
    where: { id: conversationId },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  if (!conversation || conversation.userId !== userId) {
    return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
  }

  const [user, freeQuestionsLimit, systemPrompt] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    getFreeQuestionsLimit(),
    getSystemPrompt(),
  ]);

  const hasFreeQuestion = user.freeQuestionsUsed < freeQuestionsLimit;
  const hasPaidQuestion = user.paidQuestionsRemaining > 0;
  if (!hasFreeQuestion && !hasPaidQuestion) {
    return NextResponse.json(
      { error: "Wykorzystano limit pytań.", buyUrl: "/pakiety" },
      { status: 403 },
    );
  }

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

  const modelClass = await classifyQuestion(
    messageText,
    conversation.messages.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content: m.content,
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

  const body_ = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of stream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }

        const finalMessage = await stream.finalMessage();
        const isRefusal = finalMessage.stop_reason === "refusal";
        const responseText = finalMessage.content
          .filter((block) => block.type === "text")
          .map((block) => block.text)
          .join("");

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

        if (!isRefusal) {
          if (hasFreeQuestion) {
            await prisma.user.update({
              where: { id: userId },
              data: { freeQuestionsUsed: { increment: 1 } },
            });
          } else {
            await prisma.user.update({
              where: { id: userId },
              data: { paidQuestionsRemaining: { decrement: 1 } },
            });
          }
        }
      } catch {
        controller.enqueue(
          encoder.encode("\n\n[Chwilowe przeciążenie, spróbuj za minutę.]"),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body_, {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
