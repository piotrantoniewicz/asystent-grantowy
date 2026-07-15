import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import {
  getFreeQuestionsLimit,
  getSystemPrompt,
  setFreeQuestionsLimit,
  setSystemPrompt,
} from "@/lib/settings";
import { DEFAULT_SYSTEM_PROMPT } from "@/lib/ai/prompts";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const [systemPrompt, freeQuestionsLimit] = await Promise.all([
    getSystemPrompt(),
    getFreeQuestionsLimit(),
  ]);

  return NextResponse.json({
    systemPrompt,
    freeQuestionsLimit,
    defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
  });
}

export async function PUT(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const body = (await request.json().catch(() => null)) as
    | { systemPrompt?: string; freeQuestionsLimit?: number }
    | null;

  if (
    typeof body?.systemPrompt !== "string" ||
    body.systemPrompt.trim().length === 0
  ) {
    return NextResponse.json(
      { error: "Prompt systemowy nie może być pusty." },
      { status: 400 },
    );
  }

  const limit = Number(body.freeQuestionsLimit);
  if (!Number.isInteger(limit) || limit < 0) {
    return NextResponse.json(
      { error: "Limit darmowych pytań musi być liczbą całkowitą ≥ 0." },
      { status: 400 },
    );
  }

  await Promise.all([
    setSystemPrompt(body.systemPrompt),
    setFreeQuestionsLimit(limit),
  ]);

  return NextResponse.json({ ok: true });
}
