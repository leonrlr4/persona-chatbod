export function getCookie(req: Request, name: string) {
  const cookie = req.headers.get("cookie") || "";
  const parts = cookie.split(";");
  for (const p of parts) {
    const [k, v] = p.trim().split("=");
    if (k === name) return decodeURIComponent(v || "");
  }
  return "";
}

export function verifyCsrf(req: Request) {
  const header = req.headers.get("x-csrf-token") || "";
  const cookie = getCookie(req, "csrf_token") || "";
  return Boolean(header) && header === cookie;
}