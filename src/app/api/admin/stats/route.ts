import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/admin";
import { getAdminStats } from "@/lib/admin/stats";

export async function GET() {
  const session = await requireAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Nie znaleziono." }, { status: 404 });
  }

  const stats = await getAdminStats();
  return NextResponse.json(stats);
}
