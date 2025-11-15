import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";");
  for (const p of parts) {
    const [k, v] = p.trim().split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

export async function GET(req: Request) {
  try {
    const token = getCookie(req, "session_token");
    if (!token) return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    const db = await getDb();
    const sessions = db.collection("sessions");
    const session = await sessions.findOne({ sessionId: token });
    if (!session) return NextResponse.json({ ok: false, error: "會話不存在" }, { status: 401 });
    if (session.expiresAt && Date.now() > session.expiresAt) {
      await sessions.deleteOne({ sessionId: token });
      return NextResponse.json({ ok: false, error: "會話已過期" }, { status: 401 });
    }
    const user = await db.collection("users").findOne({ userId: session.userId });
    if (!user) return NextResponse.json({ ok: false, error: "用戶不存在" }, { status: 404 });
    return NextResponse.json({ ok: true, user: { userId: user.userId, name: user.name, email: user.email } });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}