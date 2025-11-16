import { NextRequest } from "next/server";
import { verifyToken, type JwtPayload } from "./jwt";
import { getDb } from "./mongo";

// Get token from request (cookie or Authorization header)
export function getTokenFromRequest(req: NextRequest | Request): string | null {
  // Check Authorization header first
  const authHeader = req.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.substring(7);
  }

  // Check cookie
  const cookieHeader = req.headers.get("cookie") || "";
  const cookies = cookieHeader.split(";").reduce((acc, cookie) => {
    const [key, value] = cookie.trim().split("=");
    if (key && value) acc[key] = decodeURIComponent(value);
    return acc;
  }, {} as Record<string, string>);

  return cookies.access_token || null;
}

// Verify session and get user (Pure JWT - no database session check)
export async function verifySession(req: NextRequest | Request): Promise<{ userId: string; email: string } | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload || payload.type !== "access") return null;

  // Verify user exists in database
  try {
    const db = await getDb();
    const user = await db.collection("users").findOne({ userId: payload.userId });
    if (!user) return null;

    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}
