import { NextResponse } from "next/server";
import { verifyCsrf } from "@/lib/csrf";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const csrfToken = req.headers.get("x-csrf-token") || "";
    if (!verifyCsrf(csrfToken)) {
      return NextResponse.json({ ok: false, error: "CSRF 驗證失敗" }, { status: 403 });
    }

    // Pure JWT: Just clear cookies (tokens will expire naturally)
    const res = NextResponse.json({ ok: true });

    const cookieOptions = {
      httpOnly: true,
      path: "/",
      expires: new Date(0)
    };

    res.cookies.set("access_token", "", cookieOptions);
    res.cookies.set("refresh_token", "", cookieOptions);

    return res;
  } catch (e: unknown) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
