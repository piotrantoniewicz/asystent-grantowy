import { NextResponse } from "next/server";
import { PACKAGES } from "@/lib/stripe/packages";

export async function GET() {
  return NextResponse.json(PACKAGES);
}
