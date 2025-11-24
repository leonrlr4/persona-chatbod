import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { RegisterSchema, UserSchema } from "@/shared/schemas/auth";
import { verifyCsrf } from "@/lib/csrf";
import { generateAccessToken, generateRefreshToken } from "@/lib/jwt";
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
    const body = await req.json();
    const input = RegisterSchema.parse(body);

    await ensureIndexes();
    const db = await getDb();
    const users = db.collection("users");

    const email = input.email.trim().toLowerCase();
    const name = input.name.trim();

    // Check if user already exists
    const existingUser = await users.findOne({ email });
    if (existingUser) {
      return NextResponse.json({ ok: false, error: "此 Email 已被註冊" }, { status: 400 });
    }

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

    // Generate JWT tokens
    const accessToken = generateAccessToken(userId, email);
    const refreshToken = generateRefreshToken(userId, email);

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };

    const res = NextResponse.json({
      ok: true,
      user: { userId, name: doc.name, email: doc.email },
      accessToken,
      refreshToken
    });

    res.cookies.set("access_token", accessToken, {
      ...cookieOptions,
      maxAge: 7 * 24 * 60 * 60, // 7 days
    });

    res.cookies.set("refresh_token", refreshToken, {
      ...cookieOptions,
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return res;
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
