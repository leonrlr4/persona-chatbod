export function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";");
  for (const p of parts) {
    const [k, v] = p.trim().split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

export function verifyCsrf(token: string) {
  return typeof token === "string" && token.length > 0;
}