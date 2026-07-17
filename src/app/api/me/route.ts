import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit } from "@/lib/settings";
import {
  IP_FREE_QUESTIONS_PER_DAY,
  deviceQuotaKey,
  getClientIp,
  ipQuotaKey,
} from "@/lib/quota";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }

  const [user, freeQuestionsLimit] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { email: true, freeQuestionsUsed: true, paidQuestionsRemaining: true },
    }),
    getFreeQuestionsLimit(),
  ]);

  // Darmowe pytania ogranicza najciaśniejsza z trzech pul: konto, urządzenie, IP/dzień.
  // Bez ciasteczka urządzenia ścieżka darmowa jest w ogóle niedostępna (patrz quota.ts).
  const deviceId = (await cookies()).get("ag_device")?.value ?? null;
  let freeQuestionsRemaining = Math.max(
    0,
    freeQuestionsLimit - user.freeQuestionsUsed,
  );
  if (deviceId) {
    const [deviceQuota, ipQuota] = await Promise.all([
      prisma.freeQuota.findUnique({ where: { id: deviceQuotaKey(deviceId) } }),
      prisma.freeQuota.findUnique({
        where: { id: ipQuotaKey(getClientIp(request), new Date()) },
      }),
    ]);
    freeQuestionsRemaining = Math.min(
      freeQuestionsRemaining,
      Math.max(0, freeQuestionsLimit - (deviceQuota?.used ?? 0)),
      Math.max(0, IP_FREE_QUESTIONS_PER_DAY - (ipQuota?.used ?? 0)),
    );
  } else {
    freeQuestionsRemaining = 0;
  }

  return NextResponse.json({
    email: user.email,
    freeQuestionsRemaining,
    paidQuestionsRemaining: user.paidQuestionsRemaining,
  });
}
