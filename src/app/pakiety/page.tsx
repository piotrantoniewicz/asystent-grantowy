import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit } from "@/lib/settings";
import { PACKAGES } from "@/lib/stripe/packages";
import PackagesGrid from "@/components/pakiety/PackagesGrid";
import Brand from "@/components/layout/Brand";

export default async function PakietyPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { status } = await searchParams;
  const session = await auth();
  if (!session?.user?.id) return null;

  const [user, freeQuestionsLimit] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: session.user.id },
      select: { freeQuestionsUsed: true, paidQuestionsRemaining: true },
    }),
    getFreeQuestionsLimit(),
  ]);

  const freeQuestionsRemaining = Math.max(
    0,
    freeQuestionsLimit - user.freeQuestionsUsed,
  );

  return (
    <div className="min-h-full bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
        <div className="flex items-center justify-between">
          <Brand />
          <Link
            href="/"
            className="text-sm text-muted hover:text-foreground"
          >
            ← Powrót do czatu
          </Link>
        </div>

        <h1 className="font-serif text-3xl font-normal text-foreground">
          Pakiety pytań
        </h1>

        {status === "success" && (
          <p className="rounded bg-primary-soft px-3 py-2 text-sm text-primary-hover">
            Płatność przyjęta. Pytania pojawią się po potwierdzeniu przez Stripe —
            zwykle w kilka sekund. Odśwież stronę czatu, jeśli jeszcze nie widać
            nowego licznika.
          </p>
        )}
        {status === "cancel" && (
          <p className="rounded bg-accent-soft px-3 py-2 text-sm text-muted">
            Płatność anulowana. Możesz spróbować ponownie w dowolnym momencie.
          </p>
        )}

        <p className="text-sm text-muted">
          Masz {freeQuestionsRemaining} darmowych i {user.paidQuestionsRemaining}{" "}
          kupionych pytań. Pakiety sumują się i nie wygasają.
        </p>

        <PackagesGrid packages={PACKAGES} />
      </div>
    </div>
  );
}
