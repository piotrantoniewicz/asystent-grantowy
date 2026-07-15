import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripe } from "@/lib/stripe/client";
import { getPackage } from "@/lib/stripe/packages";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Musisz się zalogować." }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as { packageId?: string } | null;
  const pkg = body?.packageId ? getPackage(body.packageId) : undefined;
  if (!pkg) {
    return NextResponse.json({ error: "Nieznany pakiet." }, { status: 400 });
  }

  const purchase = await prisma.purchase.create({
    data: {
      userId: session.user.id,
      packageName: pkg.name,
      questionsGranted: pkg.questions,
      amountPln: pkg.amountPln,
      status: "pending",
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "payment",
    currency: "pln",
    client_reference_id: session.user.id,
    customer_email: session.user.email ?? undefined,
    metadata: { purchaseId: purchase.id, packageId: pkg.id },
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: "pln",
          unit_amount: pkg.amountPln * 100,
          product_data: { name: `${pkg.name} — ${pkg.questions} pytań` },
        },
      },
    ],
    success_url: `${appUrl}/pakiety?status=success`,
    cancel_url: `${appUrl}/pakiety?status=cancel`,
  });

  await prisma.purchase.update({
    where: { id: purchase.id },
    data: { stripeSessionId: checkoutSession.id },
  });

  return NextResponse.json({ url: checkoutSession.url });
}
