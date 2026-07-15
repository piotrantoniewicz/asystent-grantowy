import { NextResponse } from "next/server";
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

  if (event.type === "checkout.session.completed") {
    await applyCheckoutSessionCompleted(event.data.object);
  }

  return NextResponse.json({ received: true });
}
