import { afterAll, describe, expect, it } from "vitest";
import type Stripe from "stripe";
import { prisma } from "@/lib/db";
import { applyCheckoutSessionCompleted } from "./webhook";

if (!process.env.DATABASE_URL?.includes("test")) {
  throw new Error(
    "Test webhooka wymaga testowej bazy danych. Ustaw DATABASE_URL wskazujący na bazę z 'test' w nazwie (np. osobny branch w Neon).",
  );
}

describe("applyCheckoutSessionCompleted", () => {
  it("dolicza pytania tylko raz przy dwukrotnym dostarczeniu tego samego zdarzenia", async () => {
    const user = await prisma.user.create({
      data: { email: `webhook-test-${Date.now()}@example.com` },
    });
    const purchase = await prisma.purchase.create({
      data: {
        userId: user.id,
        packageName: "Pakiet 50",
        questionsGranted: 50,
        amountPln: 25,
        status: "pending",
      },
    });

    const fakeSession = {
      id: "cs_test_fake",
      metadata: { purchaseId: purchase.id, packageId: "pakiet-50" },
    } as unknown as Stripe.Checkout.Session;

    await applyCheckoutSessionCompleted(fakeSession);
    await applyCheckoutSessionCompleted(fakeSession);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { paidQuestionsRemaining: true },
    });
    const updatedPurchase = await prisma.purchase.findUniqueOrThrow({
      where: { id: purchase.id },
      select: { status: true },
    });

    expect(updatedUser.paidQuestionsRemaining).toBe(50);
    expect(updatedPurchase.status).toBe("paid");

    await prisma.purchase.delete({ where: { id: purchase.id } });
    await prisma.user.delete({ where: { id: user.id } });
  });
});

afterAll(async () => {
  await prisma.$disconnect();
});
