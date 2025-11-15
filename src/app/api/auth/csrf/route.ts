import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const token = crypto.randomUUID();
  const res = NextResponse.json({ ok: true, token });
  res.cookies.set("csrf_token", token, {
    httpOnly: false,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  });
  return res;
}