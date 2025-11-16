import { NextResponse } from "next/server";
import { verifySession } from "@/lib/session";
import { getDb } from "@/lib/mongo";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await verifySession(req);

    if (!session) {
      return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    }

    // Get full user data from database
    const db = await getDb();
    const user = await db.collection("users").findOne({ userId: session.userId });

    if (!user) {
      return NextResponse.json({ ok: false, error: "用戶不存在" }, { status: 401 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        userId: user.userId,
        name: user.name || user.username,
        email: user.email
      }
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}