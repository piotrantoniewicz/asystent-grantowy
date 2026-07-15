import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const { id } = await params;

  const body = (await request.json().catch(() => null)) as
    | { questions?: number }
    | null;
  const questions = Number(body?.questions);
  if (!Number.isInteger(questions) || questions === 0) {
    return NextResponse.json(
      { error: "Podaj liczbę pytań (dodatnią lub ujemną, różną od zera)." },
      { status: 400 },
    );
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: { email: true, paidQuestionsRemaining: true },
  });
  if (!user) {
    return NextResponse.json({ error: "Nie znaleziono użytkownika." }, { status: 404 });
  }

  const newRemaining = Math.max(0, user.paidQuestionsRemaining + questions);

  await prisma.user.update({
    where: { id },
    data: { paidQuestionsRemaining: newRemaining },
  });

  console.log(
    `[admin] ${session.user.email} skorygował pytania użytkownika ${user.email}: ${questions > 0 ? "+" : ""}${questions} (pozostało: ${newRemaining})`,
  );

  return NextResponse.json({ paidQuestionsRemaining: newRemaining });
}
