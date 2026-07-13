import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/logowanie",
  "/polityka-prywatnosci",
  "/regulamin",
  "/cookies",
];

const DEVICE_COOKIE = "ag_device";

export default auth((req) => {
  const { pathname } = req.nextUrl;

  let response: NextResponse;

  if (pathname.startsWith("/api/")) {
    response = NextResponse.next();
  } else {
    const isPublic =
      PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
      pathname.startsWith("/api/auth");

    if (isPublic || req.auth) {
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
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
