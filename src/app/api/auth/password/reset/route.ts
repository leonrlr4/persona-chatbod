import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { PasswordResetApplySchema } from "@/shared/schemas/auth";
import { verifyCsrf } from "@/lib/csrf";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function now() { return Date.now(); }

export async function POST(req: Request) {
  try {
    if (!verifyCsrf(req)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }
    const body = await req.json();
    const input = PasswordResetApplySchema.parse(body);
    const db = await getDb();
    const resets = db.collection("password_resets");
    const reset = await resets.findOne({ token: input.token });
    if (!reset) return NextResponse.json({ ok: false, error: "重置連結無效" }, { status: 400 });
    if (reset.expiresAt && now() > reset.expiresAt) {
      await resets.deleteOne({ token: input.token });
      return NextResponse.json({ ok: false, error: "重置連結已過期" }, { status: 400 });
    }
    const passwordHash = await bcrypt.hash(input.newPassword, 12);
    await db.collection("users").updateOne({ userId: reset.userId }, { $set: { passwordHash, updatedAt: now() } });
    // 清除既有會話
    await db.collection("sessions").deleteMany({ userId: reset.userId });
    // 刪除重置 token
    await resets.deleteOne({ token: input.token });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}