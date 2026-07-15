import type Stripe from "stripe";
import { prisma } from "@/lib/db";

export async function applyCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const purchaseId = session.metadata?.purchaseId;
  if (!purchaseId) {
    console.error("Webhook Stripe: brak purchaseId w metadata sesji", session.id);
    return;
  }

  const purchase = await prisma.purchase.findUnique({ where: { id: purchaseId } });
  if (!purchase) {
    console.error("Webhook Stripe: nie znaleziono zakupu", purchaseId);
    return;
  }

  if (purchase.status === "paid") {
    return;
  }

  await prisma.$transaction(async (tx) => {
    const update = await tx.purchase.updateMany({
      where: { id: purchaseId, status: { not: "paid" } },
      data: { status: "paid" },
    });
    if (update.count === 0) return;

    await tx.user.update({
      where: { id: purchase.userId },
      data: { paidQuestionsRemaining: { increment: purchase.questionsGranted } },
    });
  });
}
