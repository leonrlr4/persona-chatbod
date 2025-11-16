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
    const csrfToken = req.headers.get("x-csrf-token") || "";
    const ok = await verifyCsrf(csrfToken);
    if (!ok) return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    const body = await req.json();
    const input = LoginSchema.parse(body);
    const db = await getDb();
    const users = db.collection("users");
    try { await users.dropIndex("username_1"); } catch {}
    const email = input.email.trim().toLowerCase();
    let user = await users.findOne({ email });

    if (!user) {
      const passwordHash = await bcrypt.hash(input.password, 8);
      const userId = crypto.randomUUID();
      await users.insertOne({ userId, username: email, name: email.split("@")[0] || "", email, passwordHash, createdAt: now(), updatedAt: now() });
      user = await users.findOne({ email });
      if (!user) {
        throw new Error("User creation failed");
      }
    }

    if (user?.passwordHash) {
      const passOk = await bcrypt.compare(input.password, user.passwordHash);
      if (!passOk) return NextResponse.json({ ok: false, error: "密碼錯誤" }, { status: 401 });
    }

    // 移除嘗試次數限制與重置

    const expiresMs = input.remember ? 30 * 24 * 60 * 60 * 1000 : 60 * 60 * 1000;
    const expires = new Date(Date.now() + expiresMs);
    const userId = user.userId || user._id.toString();
    const sessionToken = `${userId}.${crypto.randomUUID()}`;
    const sessions = db.collection("sessions");
    await sessions.createIndex({ sessionId: 1 }, { unique: true });
    await sessions.insertOne({ sessionId: sessionToken, userId: userId, createdAt: now(), expiresAt: expires.getTime() });

    const res = NextResponse.json({ ok: true, user: { userId: userId, name: (user.name || user.username), email: user.email } });
    res.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires,
    });
    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}