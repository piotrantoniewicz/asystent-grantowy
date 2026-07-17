import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }
  const { id } = await params;

  const organization = await prisma.userOrganization.findUnique({
    where: { id },
    select: { userId: true },
  });

  if (!organization || organization.userId !== session.user.id) {
    return NextResponse.json({ error: "Nie znaleziono organizacji." }, { status: 404 });
  }

  await prisma.userOrganization.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
