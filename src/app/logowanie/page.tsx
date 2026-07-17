import Link from "next/link";
import { signIn } from "@/lib/auth";
import Brand from "@/components/layout/Brand";

export default async function LogowaniePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <main className="flex min-h-full items-center justify-center bg-background px-4">
      <div className="w-full max-w-sm space-y-6 rounded border border-border bg-surface p-8 shadow-sm">
        <div className="space-y-3 text-center">
          <Brand className="justify-center" />
          <h1 className="font-serif text-3xl font-normal text-foreground">
            Zaloguj się
          </h1>
          <p className="text-sm text-muted">
            Podaj swój adres e-mail. Wyślemy Ci link do zalogowania — bez
            hasła.
          </p>
        </div>

        {error && (
          <p className="rounded bg-danger-soft px-3 py-2 text-sm text-danger">
            Nie udało się wysłać linku logującego. Spróbuj ponownie.
          </p>
        )}

        <form
          action={async (formData) => {
            "use server";
            const email = String(formData.get("email") ?? "")
              .trim()
              .toLowerCase();
            if (!email) return;

            // Limit 10 maili dziennie na adres — ochrona przed spamem przez Resend.
            const { createHash } = await import("node:crypto");
            const { prisma } = await import("@/lib/db");
            const day = new Date().toISOString().slice(0, 10);
            const hash = createHash("sha256").update(email).digest("hex").slice(0, 16);
            const key = `login:${hash}:${day}`;

            const quota = await prisma.freeQuota.upsert({
              where: { id: key },
              create: { id: key, used: 1 },
              update: { used: { increment: 1 } },
            });
            if (quota.used > 10) {
              return;
            }

            await signIn("resend", { email, redirectTo: callbackUrl || "/" });
          }}
          className="space-y-3"
        >
          <input
            type="email"
            name="email"
            required
            placeholder="twoj@email.pl"
            className="w-full rounded border border-border bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20"
          />
          <button
            type="submit"
            className="w-full rounded-full bg-primary px-3 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-hover"
          >
            Wyślij link logujący
          </button>
        </form>

        <p className="text-center text-xs text-muted">
          Logując się akceptujesz{" "}
          <Link href="/regulamin" className="text-primary-hover underline hover:no-underline">
            Regulamin
          </Link>{" "}
          i{" "}
          <Link
            href="/polityka-prywatnosci"
            className="text-primary-hover underline hover:no-underline"
          >
            Politykę prywatności
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
