import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }

  const grants = await prisma.userGrant.findMany({
    where: { userId: session.user.id },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, rootUrl: true, name: true, summary: true },
  });

  return NextResponse.json(grants);
}
