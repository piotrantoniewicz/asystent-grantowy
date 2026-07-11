import { signIn } from "@/lib/auth";

export default async function LogowaniePage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const { callbackUrl, error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-2xl font-semibold">Zaloguj się</h1>
          <p className="text-sm text-gray-500">
            Podaj swój adres e-mail. Wyślemy Ci link do zalogowania — bez
            hasła.
          </p>
        </div>

        {error && (
          <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
            Nie udało się wysłać linku logującego. Spróbuj ponownie.
          </p>
        )}

        <form
          action={async (formData) => {
            "use server";
            await signIn("resend", {
              email: formData.get("email"),
              redirectTo: callbackUrl || "/",
            });
          }}
          className="space-y-3"
        >
          <input
            type="email"
            name="email"
            required
            placeholder="twoj@email.pl"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-black focus:outline-none"
          />
          <button
            type="submit"
            className="w-full rounded-md bg-black px-3 py-2 text-sm font-medium text-white hover:bg-gray-800"
          >
            Wyślij link logujący
          </button>
        </form>
      </div>
    </main>
  );
}
