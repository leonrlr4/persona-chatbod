export async function fetchJSON<T>(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { "content-type": "application/json", ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(`${res.status}`);
  return (await res.json()) as T;
}

export async function listPersonas() {
  return fetchJSON<{ ok: boolean; personas: any[] }>("/api/personas");
}

export async function getPrefs(userId: string) {
  const url = `/api/prefs?userId=${encodeURIComponent(userId)}`;
  return fetchJSON<{ ok: boolean; prefs: any | null }>(url);
}