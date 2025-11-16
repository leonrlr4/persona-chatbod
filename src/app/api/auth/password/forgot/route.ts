import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { PasswordResetRequestSchema } from "@/shared/schemas/auth";
import { verifyCsrf } from "@/lib/csrf";

export const runtime = "nodejs";

function now() { return Date.now(); }

export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }
    const body = await req.json();
    const input = PasswordResetRequestSchema.parse(body);
    const db = await getDb();
    const user = await db.collection("users").findOne({ email: input.email });
    // 即使用戶不存在，仍返回成功以避免暴露帳號資訊
    if (!user) return NextResponse.json({ ok: true });
    const token = crypto.randomUUID();
    const expiresAt = now() + 60 * 60 * 1000; // 1h
    const resets = db.collection("password_resets");
    await resets.createIndex({ token: 1 }, { unique: true });
    await resets.insertOne({ token, userId: user.userId, createdAt: now(), expiresAt });
    // 郵件發送占位：需要設定 SMTP/郵件服務才能實際寄送
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}