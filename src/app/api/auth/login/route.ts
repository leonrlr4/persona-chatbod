import { NextResponse } from "next/server";
import { getDb } from "@/lib/mongo";
import { LoginSchema } from "@/shared/schemas/auth";
import { verifyCsrf } from "@/lib/csrf";
import { generateAccessToken, generateRefreshToken } from "@/lib/jwt";
import bcrypt from "bcryptjs";

export const runtime = "nodejs";

function now() { return Date.now(); }

export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    const ok = await verifyCsrf(csrfToken);
    if (!ok) return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });

    const body = await req.json();
    const input = LoginSchema.parse(body);
    const db = await getDb();
    const users = db.collection("users");

    const email = input.email.trim().toLowerCase();

    let user = await users.findOne({ email });

    // Auto-register if user doesn't exist
    if (!user) {
      const passwordHash = await bcrypt.hash(input.password, 12);
      const userId = crypto.randomUUID();
      await users.insertOne({
        userId,
        username: email,
        name: email.split("@")[0] || "",
        email,
        passwordHash,
        createdAt: now(),
        updatedAt: now()
      });
      user = await users.findOne({ email });
      if (!user) {
        throw new Error("User creation failed");
      }
    }

    // Verify password
    const passwordHash = user.passwordHash || user.password;
    if (passwordHash) {
      const passOk = await bcrypt.compare(input.password, passwordHash);
      if (!passOk) {
        return NextResponse.json({ ok: false, error: "密碼錯誤" }, { status: 401 });
      }
    }

    // Generate JWT tokens
    const userId = user.userId || user._id.toString();
    const accessToken = generateAccessToken(userId, user.email);
    const refreshToken = generateRefreshToken(userId, user.email);

    // Set cookies
    const cookieOptions = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
    };

    const res = NextResponse.json({
      ok: true,
      user: {
        userId,
        name: user.name || user.username,
        email: user.email
      },
      accessToken,
      refreshToken
    });

    res.cookies.set("access_token", accessToken, {
      ...cookieOptions,
      maxAge: input.remember ? 30 * 24 * 60 * 60 : 7 * 24 * 60 * 60, // 30d or 7d
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
