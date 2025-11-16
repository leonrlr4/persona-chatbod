import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { verifyCsrf, getCookie } from "@/lib/csrf";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const token = getCookie(req, "session_token");
    if (!token) return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    const db = await getDb();
    const session = await db.collection("sessions").findOne({ sessionId: token });
    if (!session) return NextResponse.json({ ok: false, error: "會話不存在" }, { status: 401 });
    const user = await db.collection("users").findOne({ userId: session.userId });
    if (!user) return NextResponse.json({ ok: false, error: "用戶不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, user: { userId: user.userId, name: user.name, email: user.email } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    const token = getCookie(req, "session_token");
    if (!token) return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    const db = await getDb();
    const session = await db.collection("sessions").findOne({ sessionId: token });
    if (!session) return NextResponse.json({ ok: false, error: "會話不存在" }, { status: 401 });
    const body = await req.json();
    const name = String(body?.name || "").trim();
    if (!name) return NextResponse.json({ ok: false, error: "名稱不可為空" }, { status: 400 });
    await db.collection("users").updateOne({ userId: session.userId }, { $set: { name, updatedAt: Date.now() } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}