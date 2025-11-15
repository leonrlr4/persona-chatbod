import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({ ok: false, error: "尚未配置 Google OAuth" }, { status: 501 });
}