import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ sourceId: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }
  const { sourceId } = await params;

  const source = await prisma.scrapedSource.findUnique({
    where: { id: sourceId },
    include: {
      conversation: { select: { userId: true } },
      pages: { select: { url: true, title: true, contentType: true } },
    },
  });

  if (!source || source.conversation.userId !== session.user.id) {
    return NextResponse.json({ error: "Nie znaleziono źródła." }, { status: 404 });
  }

  return NextResponse.json({
    status: source.status,
    summary: source.summary,
    pages: source.pages,
  });
}
