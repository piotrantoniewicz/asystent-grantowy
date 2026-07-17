import Brand from "@/components/layout/Brand";

export default function SprawdzSkrzynkePage() {
  return (
    <main className="flex min-h-full items-center justify-center bg-background px-4">
      <div className="max-w-sm space-y-3 rounded border border-border bg-surface p-8 text-center shadow-sm">
        <Brand className="justify-center" />
        <h1 className="font-serif text-2xl font-normal text-foreground">
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
