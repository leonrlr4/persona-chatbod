import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname.startsWith("/@vite/client")) {
    return new Response(null, { status: 204 });
  }
  if (pathname.startsWith("/profile")) {
    const token = req.cookies.get("session_token")?.value || "";
    if (!token) {
      const url = req.nextUrl.clone();
      url.pathname = "/";
      return NextResponse.redirect(url);
    }
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/profile", "/@vite/client"],
};