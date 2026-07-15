import Link from "next/link";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getFreeQuestionsLimit } from "@/lib/settings";
import { PACKAGES } from "@/lib/stripe/packages";
import BuyButton from "@/components/pakiety/BuyButton";

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
    <div className="mx-auto flex max-w-2xl flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Pakiety pytań</h1>
        <Link href="/" className="text-sm text-gray-500 hover:text-gray-900">
          ← Powrót do czatu
        </Link>
      </div>

      {status === "success" && (
        <p className="rounded-md bg-green-50 px-3 py-2 text-sm text-green-700">
          Płatność przyjęta. Pytania pojawią się po potwierdzeniu przez Stripe —
          zwykle w kilka sekund. Odśwież stronę czatu, jeśli jeszcze nie widać
          nowego licznika.
        </p>
      )}
      {status === "cancel" && (
        <p className="rounded-md bg-gray-100 px-3 py-2 text-sm text-gray-600">
          Płatność anulowana. Możesz spróbować ponownie w dowolnym momencie.
        </p>
      )}

      <p className="text-sm text-gray-600">
        Masz {freeQuestionsRemaining} darmowych i {user.paidQuestionsRemaining}{" "}
        kupionych pytań. Pakiety sumują się i nie wygasają.
      </p>

      <div className="grid gap-4 sm:grid-cols-3">
        {PACKAGES.map((pkg) => (
          <div
            key={pkg.id}
            className="flex flex-col items-center gap-3 rounded-lg border border-gray-200 p-4 text-center"
          >
            <p className="text-sm font-semibold">{pkg.name}</p>
            <p className="text-2xl font-bold">{pkg.amountPln} zł</p>
            <p className="text-xs text-gray-500">{pkg.questions} pytań</p>
            <BuyButton packageId={pkg.id} />
          </div>
        ))}
      </div>
    </div>
  );
}
