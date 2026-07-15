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

  const [users, total] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        email: true,
        createdAt: true,
        freeQuestionsUsed: true,
        paidQuestionsRemaining: true,
        purchases: {
          where: { status: "paid" },
          select: { amountPln: true },
        },
      },
    }),
    prisma.user.count(),
  ]);

  return NextResponse.json({
    users: users.map((u) => ({
      id: u.id,
      email: u.email,
      createdAt: u.createdAt,
      freeQuestionsUsed: u.freeQuestionsUsed,
      paidQuestionsRemaining: u.paidQuestionsRemaining,
      totalPurchasedPln: u.purchases.reduce((sum, p) => sum + p.amountPln, 0),
    })),
    page,
    pageSize: PAGE_SIZE,
    total,
  });
}
