import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { LoginSchema } from "@/shared/schemas/auth";
import { verifyCsrf } from "@/lib/csrf";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function now() { return Date.now(); }

async function rateLimited(db: any, identifier: string) {
  const col = db.collection("login_attempts");
  await col.createIndex({ identifier: 1 });
  const windowMs = 15 * 60 * 1000;
  const limit = 5;
  const key = identifier;
  const doc = await col.findOne({ identifier: key });
  const ts = now();
  if (!doc || (ts - (doc.updatedAt || 0)) > windowMs) {
    await col.updateOne({ identifier: key }, { $set: { count: 0, updatedAt: ts } }, { upsert: true });
    return { ok: true };
  }
  if ((doc.count || 0) >= limit) {
    return { ok: false };
  }
  return { ok: true };
}

async function bumpAttempt(db: any, identifier: string) {
  const col = db.collection("login_attempts");
  await col.updateOne({ identifier }, { $inc: { count: 1 }, $set: { updatedAt: now() } }, { upsert: true });
}

export async function POST(req: Request) {
  try {
    if (!verifyCsrf(req)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }
    const body = await req.json();
    const input = LoginSchema.parse(body);
    const db = await getDb();

    const rl = await rateLimited(db, input.identifier);
    if (!rl.ok) {
      return NextResponse.json({ ok: false, error: "登入嘗試過多，請稍後再試" }, { status: 429 });
    }

    const users = db.collection("users");
    let user: any | null = null;
    if (input.identifier.includes("@")) {
      user = await users.findOne({ email: input.identifier });
    } else {
      const matches = await users.find({ name: input.identifier }).toArray();
      if (matches.length === 1) user = matches[0];
      else if (matches.length > 1) {
        await bumpAttempt(db, input.identifier);
        return NextResponse.json({ ok: false, error: "使用者名稱不唯一，請改用電子郵件登入" }, { status: 400 });
      }
    }

    if (!user) {
      await bumpAttempt(db, input.identifier);
      return NextResponse.json({ ok: false, error: "帳號不存在" }, { status: 404 });
    }
    // 檢查密碼（支援兩種欄位名稱）
    const passwordHash = user.passwordHash || user.password;
    if (!passwordHash) {
      await bumpAttempt(db, input.identifier);
      return NextResponse.json({ ok: false, error: "密碼未設定" }, { status: 401 });
    }
    
    const ok = await bcrypt.compare(input.password, passwordHash);
    if (!ok) {
      await bumpAttempt(db, input.identifier);
      return NextResponse.json({ ok: false, error: "密碼錯誤" }, { status: 401 });
    }

    // reset attempts on success
    await db.collection("login_attempts").updateOne({ identifier: input.identifier }, { $set: { count: 0, updatedAt: now() } }, { upsert: true });

    const expiresMs = input.remember ? 30 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const expires = new Date(Date.now() + expiresMs);
    const userId = user.userId || user._id.toString();
    const sessionToken = `${userId}.${crypto.randomUUID()}`;
    const sessions = db.collection("sessions");
    await sessions.createIndex({ sessionId: 1 }, { unique: true });
    await sessions.insertOne({ sessionId: sessionToken, userId: userId, createdAt: now(), expiresAt: expires.getTime() });

    const res = NextResponse.json({ ok: true, user: { userId: userId, name: user.name || user.username, email: user.email } });
    res.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}