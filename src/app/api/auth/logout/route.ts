import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { verifyCsrf } from "@/lib/csrf";

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

export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }
    const token = getCookie(req, "session_token");
    if (token) {
      const db = await getDb();
      await db.collection("sessions").deleteOne({ sessionId: token });
    }
    const res = NextResponse.json({ ok: true });
    res.cookies.set("session_token", "", { httpOnly: true, path: "/", expires: new Date(0) });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}