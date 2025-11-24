export async function fetchJSON<T>(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) }, credentials: "include" });
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  let data: unknown = null;
  try {
    data = isJson ? await res.json() : null;
  } catch {
    data = null;
  }
  if (res.ok) return data as T;
  if (data !== null) return data as T;
  throw new Error(`${res.status}`);
}

export async function listPersonas() {
  return fetchJSON<{ ok: boolean; personas: unknown[] }>("/api/personas");
}

export async function getPrefs(userId: string) {
  const url = `/api/prefs?userId=${encodeURIComponent(userId)}`;
  return fetchJSON<{ ok: boolean; prefs: unknown | null }>(url);
}
