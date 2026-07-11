import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

const PUBLIC_PATHS = [
  "/logowanie",
  "/polityka-prywatnosci",
  "/regulamin",
  "/cookies",
];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  const isPublic =
    PUBLIC_PATHS.some((path) => pathname.startsWith(path)) ||
    pathname.startsWith("/api/auth");

  if (isPublic || req.auth) {
    return NextResponse.next();
  }

  const signInUrl = new URL("/logowanie", req.nextUrl.origin);
  signInUrl.searchParams.set("callbackUrl", pathname);
  return NextResponse.redirect(signInUrl);
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
