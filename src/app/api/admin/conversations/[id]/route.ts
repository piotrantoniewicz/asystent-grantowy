import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/db";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const { id } = await params;

  const conversation = await prisma.conversation.findUnique({
    where: { id },
    include: {
      user: { select: { email: true } },
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          role: true,
          content: true,
          modelUsed: true,
          createdAt: true,
        },
      },
      scrapedSources: {
        select: { id: true, kind: true, rootUrl: true, status: true, summary: true },
      },
    },
  });

  if (!conversation) {
    return NextResponse.json({ error: "Nie znaleziono rozmowy." }, { status: 404 });
  }

  return NextResponse.json({
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    userEmail: conversation.user.email,
    messages: conversation.messages,
    scrapedSources: conversation.scrapedSources,
  });
}
