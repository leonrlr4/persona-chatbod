import { NextResponse } from "next/server";
import { verifyToken, generateAccessToken } from "@/lib/jwt";
import { getTokenFromRequest } from "@/lib/session";
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

export async function POST(req: Request) {
  try {
    // Get refresh token from cookie or body
    let refreshToken = getCookie(req, "refresh_token");

    if (!refreshToken) {
      const body = await req.json();
      refreshToken = body.refreshToken;
    }

    if (!refreshToken) {
      return NextResponse.json({ ok: false, error: "缺少 refresh token" }, { status: 401 });
    }

    // Verify refresh token
    const payload = verifyToken(refreshToken);
    if (!payload || payload.type !== "refresh") {
      return NextResponse.json({ ok: false, error: "無效的 refresh token" }, { status: 401 });
    }

    // Verify user still exists
    const db = await getDb();
    const user = await db.collection("users").findOne({ userId: payload.userId });
    if (!user) {
      return NextResponse.json({ ok: false, error: "用戶不存在" }, { status: 401 });
    }

    // Generate new access token
    const newAccessToken = generateAccessToken(payload.userId, payload.email);

    const res = NextResponse.json({
      ok: true,
      accessToken: newAccessToken
    });

    // Set new access token cookie
    res.cookies.set("access_token", newAccessToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    return res;
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
