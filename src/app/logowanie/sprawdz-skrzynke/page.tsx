export default function SprawdzSkrzynkePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-sm space-y-3 rounded-2xl border border-border bg-surface p-8 text-center shadow-sm">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary-soft text-xl">
          ✉️
        </div>
        <h1 className="text-2xl font-semibold text-foreground">
          Sprawdź skrzynkę e-mail
        </h1>
        <p className="text-sm text-muted">
          Wysłaliśmy Ci link do zalogowania. Kliknij go, aby wejść do
          aplikacji.
        </p>
      </div>
    </main>
  );
}
