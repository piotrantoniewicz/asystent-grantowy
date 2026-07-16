import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe/client";
import { applyCheckoutSessionCompleted } from "@/lib/stripe/webhook";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!signature || !webhookSecret) {
    return NextResponse.json({ error: "Brak podpisu webhooka." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
  } catch (error) {
    console.error("Webhook Stripe: nieprawidłowy podpis", error);
    return NextResponse.json({ error: "Nieprawidłowy podpis." }, { status: 400 });
  }

  if (
    event.type === "checkout.session.completed" ||
    event.type === "checkout.session.async_payment_succeeded"
  ) {
    const checkoutSession = event.data.object;
    if (checkoutSession.payment_status === "paid") {
      await applyCheckoutSessionCompleted(checkoutSession);
    }
  }

  if (
    event.type === "checkout.session.async_payment_failed" ||
    event.type === "checkout.session.expired"
  ) {
    const purchaseId = event.data.object.metadata?.purchaseId;
    if (purchaseId) {
      await prisma.purchase.updateMany({
        where: { id: purchaseId, status: "pending" },
        data: { status: "failed" },
      });
    }
  }

  return NextResponse.json({ received: true });
}
