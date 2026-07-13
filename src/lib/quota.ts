import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";

export const MESSAGE_MAX_LENGTH = 50_000;
export const RATE_LIMIT_PER_MINUTE = 4;
export const IP_FREE_QUESTIONS_PER_DAY = 30;

export function deviceQuotaKey(deviceId: string): string {
  return `device:${deviceId}`;
}

export function ipQuotaKey(ip: string, date: Date): string {
  const hash = createHash("sha256")
    .update(ip + process.env.AUTH_SECRET)
    .digest("hex")
    .slice(0, 16);
  const day = date.toISOString().slice(0, 10);
  return `ip:${hash}:${day}`;
}

export function getClientIp(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (!forwardedFor) return "local";
  return forwardedFor.split(",")[0].trim() || "local";
}

export function truncateForClassifier(text: string): string {
  return text.slice(0, 500);
}

export type ReserveResult = "free" | "paid" | "no-quota" | "no-cookie";

export async function reserveQuestion(params: {
  userId: string;
  deviceId: string | null;
  ip: string;
  freeLimit: number;
}): Promise<ReserveResult> {
  const { userId, deviceId, ip, freeLimit } = params;

  let hadFreeQuestionAvailable = false;

  if (deviceId) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        const userUpdate = await tx.user.updateMany({
          where: { id: userId, freeQuestionsUsed: { lt: freeLimit } },
          data: { freeQuestionsUsed: { increment: 1 } },
        });
        if (userUpdate.count === 0) {
          return "user-exhausted" as const;
        }

        const deviceKey = deviceQuotaKey(deviceId);
        await tx.freeQuota.upsert({
          where: { id: deviceKey },
          create: { id: deviceKey, used: 0 },
          update: {},
        });
        const deviceUpdate = await tx.freeQuota.updateMany({
          where: { id: deviceKey, used: { lt: freeLimit } },
          data: { used: { increment: 1 } },
        });
        if (deviceUpdate.count === 0) {
          throw new Error("device-exhausted");
        }

        const ipKey = ipQuotaKey(ip, new Date());
        await tx.freeQuota.upsert({
          where: { id: ipKey },
          create: { id: ipKey, used: 0 },
          update: {},
        });
        const ipUpdate = await tx.freeQuota.updateMany({
          where: { id: ipKey, used: { lt: IP_FREE_QUESTIONS_PER_DAY } },
          data: { used: { increment: 1 } },
        });
        if (ipUpdate.count === 0) {
          throw new Error("ip-exhausted");
        }

        return "free" as const;
      });

      if (result === "free") return "free";
    } catch {
      // ścieżka darmowa wyczerpana (urządzenie lub IP) — przejdź do płatnej
    }
  } else {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { freeQuestionsUsed: true },
    });
    hadFreeQuestionAvailable = (user?.freeQuestionsUsed ?? freeLimit) < freeLimit;
  }

  const paidUpdate = await prisma.user.updateMany({
    where: { id: userId, paidQuestionsRemaining: { gt: 0 } },
    data: { paidQuestionsRemaining: { decrement: 1 } },
  });
  if (paidUpdate.count === 1) return "paid";

  if (hadFreeQuestionAvailable) {
    return "no-cookie";
  }
  return "no-quota";
}

export async function refundQuestion(params: {
  userId: string;
  deviceId: string | null;
  ip: string;
  kind: "free" | "paid";
}): Promise<void> {
  const { userId, deviceId, ip, kind } = params;

  if (kind === "paid") {
    await prisma.user.update({
      where: { id: userId },
      data: { paidQuestionsRemaining: { increment: 1 } },
    });
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.user.updateMany({
      where: { id: userId, freeQuestionsUsed: { gt: 0 } },
      data: { freeQuestionsUsed: { decrement: 1 } },
    });

    if (deviceId) {
      await tx.freeQuota.updateMany({
        where: { id: deviceQuotaKey(deviceId), used: { gt: 0 } },
        data: { used: { decrement: 1 } },
      });
    }

    await tx.freeQuota.updateMany({
      where: { id: ipQuotaKey(ip, new Date()), used: { gt: 0 } },
      data: { used: { decrement: 1 } },
    });
  });
}
