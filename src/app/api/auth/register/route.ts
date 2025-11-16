import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { RegisterSchema, UserSchema } from "@/shared/schemas/auth";
import { verifyCsrf } from "@/lib/csrf";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function now() { return Date.now(); }

async function ensureIndexes() {
  const db = await getDb();
  const users = db.collection("users");
  try {
    await users.dropIndex("email_1");
  } catch {}
  try {
    await users.dropIndex("username_1");
  } catch {}
  await users.createIndex({ email: 1 }, { unique: false });
  await users.createIndex({ userId: 1 }, { unique: true });
}

export async function POST(req: Request) {
  try {
    // 移除 CSRF 檢查
    const body = await req.json();
    const input = RegisterSchema.parse(body);

    await ensureIndexes();
    const db = await getDb();
    const users = db.collection("users");

    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    // 允許重複 email 註冊

    const passwordHash = await bcrypt.hash(input.password, 12);
    const userId = crypto.randomUUID();
    const doc = UserSchema.parse({
      userId,
      name,
      email,
      passwordHash,
      createdAt: now(),
      updatedAt: now(),
    });

    await users.insertOne({ ...doc, username: email });

    const res = NextResponse.json({ ok: true, user: { userId, name: doc.name, email: doc.email } });
    // 自動登入：建立短期會話 cookie（無記住我）
    const sessionToken = `${userId}.${crypto.randomUUID()}`;
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    res.cookies.set("session_token", sessionToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      expires,
    });
    const sessions = db.collection("sessions");
    await sessions.createIndex({ sessionId: 1 }, { unique: true });
    await sessions.insertOne({ sessionId: sessionToken, userId, createdAt: now(), expiresAt: expires.getTime() });

    return res;
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
  }
}