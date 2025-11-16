import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "jwt-secret-key-here";
const JWT_EXPIRES_IN = "7d"; // Access token: 7 days
const REFRESH_TOKEN_EXPIRES_IN = "30d"; // Refresh token: 30 days

export interface JwtPayload {
  userId: string;
  email: string;
  type: "access" | "refresh";
}

// Generate access token
export function generateAccessToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email, type: "access" } as JwtPayload,
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Generate refresh token
export function generateRefreshToken(userId: string, email: string): string {
  return jwt.sign(
    { userId, email, type: "refresh" } as JwtPayload,
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

// Verify token
export function verifyToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    return decoded;
  } catch (error) {
    return null;
  }
}

// Decode token without verification
export function decodeToken(token: string): JwtPayload | null {
  try {
    return jwt.decode(token) as JwtPayload;
  } catch {
    return null;
  }
}
