import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = [
  "/logowanie",
  "/polityka-prywatnosci",
  "/regulamin",
  "/cookies",
];

const DEVICE_COOKIE = "ag_device";

// Nazwy ciasteczka sesji używane przez Auth.js (druga wersja — na https).
const SESSION_COOKIES = [
  "authjs.session-token",
  "__Secure-authjs.session-token",
];

// UWAGA: tutaj tylko SPRAWDZAMY, CZY JEST ciasteczko sesji — nie weryfikujemy go
// w bazie. To wyłącznie wygoda (przekierowanie na stronę logowania). Prawdziwe
// sprawdzenie, kim jest użytkownik, robi każda strona i każde /api osobno
// (`auth()` w kodzie strony). Wcześniej pośrednik odpytywał bazę przy KAŻDYM
// żądaniu — także o obrazki i pliki — i to spowalniało całą aplikację.
export default function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  let response: NextResponse;

  if (pathname.startsWith("/api/")) {
    response = NextResponse.next();
  } else {
    const isPublic =
      PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
      pathname.startsWith("/api/auth");
    const hasSessionCookie = SESSION_COOKIES.some((name) =>
      req.cookies.has(name),
    );

    if (isPublic || hasSessionCookie) {
      response = NextResponse.next();
    } else {
      const signInUrl = new URL("/logowanie", req.nextUrl.origin);
      signInUrl.searchParams.set("callbackUrl", pathname);
      response = NextResponse.redirect(signInUrl);
    }
  }

  if (!req.cookies.get(DEVICE_COOKIE)) {
    response.cookies.set(DEVICE_COOKIE, crypto.randomUUID(), {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 400,
    });
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
