import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/db";

const PAGE_SIZE = 20;

export async function GET(request: Request) {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, Number.parseInt(searchParams.get("page") ?? "1", 10) || 1);
  const email = searchParams.get("email")?.trim();

  const where = email
    ? { user: { email: { contains: email, mode: "insensitive" as const } } }
    : {};

  const [conversations, total] = await Promise.all([
    prisma.conversation.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        title: true,
        createdAt: true,
        user: { select: { email: true } },
        _count: { select: { messages: true } },
      },
    }),
    prisma.conversation.count({ where }),
  ]);

  return NextResponse.json({
    conversations: conversations.map((c) => ({
      id: c.id,
      title: c.title,
      createdAt: c.createdAt,
      userEmail: c.user.email,
      messageCount: c._count.messages,
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
  });
}
