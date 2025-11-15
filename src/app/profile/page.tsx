"use client";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { fetchJSON } from "@/utils/api";
import { useRouter } from "next/navigation";

export default function ProfilePage() {
  const { isAuthenticated, user, fetchCsrf, csrfToken } = useAuth();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/");
      return;
    }
    setName(user?.name || "");
    setLoading(false);
  }, [isAuthenticated, user, router]);

  const save = async () => {
    await fetchCsrf();
    await fetchJSON("/api/auth/profile", {
      method: "POST",
      headers: { "x-csrf-token": csrfToken || "" },
      body: JSON.stringify({ name })
    }).catch(() => {});
  };

  if (loading) return null;
  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-zinc-100">用戶資料</h1>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm text-zinc-300">電子郵件</label>
          <input disabled value={user?.email || ""} className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-400" />
        </div>
        <div>
          <label className="mb-1 block text-sm text-zinc-300">名稱</label>
          <input value={name} onChange={e => setName(e.target.value)} className="w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-zinc-100" />
        </div>
        <button onClick={save} className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-zinc-100">儲存</button>
      </div>
    </div>
  );
}