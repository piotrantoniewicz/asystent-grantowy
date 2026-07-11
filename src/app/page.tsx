import { auth, signOut } from "@/lib/auth";

export default async function Home() {
  const session = await auth();

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-2xl font-semibold">Asystent Wniosków Grantowych</h1>
      <p className="text-sm text-gray-500">
        Zalogowano jako <strong>{session?.user?.email}</strong>
        {session?.user?.isAdmin ? " (admin)" : ""}
      </p>
      <p className="text-sm text-gray-400">
        Czat pojawi się w kolejnym etapie budowy aplikacji.
      </p>
      <form
        action={async () => {
          "use server";
          await signOut({ redirectTo: "/logowanie" });
        }}
      >
        <button
          type="submit"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm hover:bg-gray-50"
        >
          Wyloguj się
        </button>
      </form>
    </main>
  );
}
