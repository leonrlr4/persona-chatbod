import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { verifyCsrf } from "@/lib/csrf";
import { verifySession } from "@/lib/session";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    }

    const db = await getDb();
    const user = await db.collection("users").findOne({ userId: session.userId });
    if (!user) {
      return NextResponse.json({ ok: false, error: "用戶不存在" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email
      }
    });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}

export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }

    const session = await verifySession(req);
    if (!session) {
      return NextResponse.json({ ok: false, error: "未登入" }, { status: 401 });
    }

    const body = await req.json();
    const name = String(body?.name || "").trim();
    if (!name) {
      return NextResponse.json({ ok: false, error: "名稱不可為空" }, { status: 400 });
    }

    const db = await getDb();
    await db.collection("users").updateOne(
      { userId: session.userId },
      { $set: { name, updatedAt: Date.now() } }
    );

    return NextResponse.json({ ok: true });
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
