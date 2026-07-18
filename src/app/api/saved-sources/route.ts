import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kind = searchParams.get("kind");
  if (kind !== null && kind !== "organization" && kind !== "grant") {
    return NextResponse.json(
      { error: "Podaj poprawny rodzaj (organization albo grant)." },
      { status: 400 },
    );
  }

  const savedSources = await prisma.savedSource.findMany({
    where: { userId: session.user.id, ...(kind ? { kind } : {}) },
    orderBy: { lastUsedAt: "desc" },
    select: { id: true, kind: true, rootUrl: true, name: true, summary: true },
  });

  return NextResponse.json(savedSources);
}
