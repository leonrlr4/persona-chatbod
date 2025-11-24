"use client";
import { useState, useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useRouter } from "next/navigation";

export default function UploadPersonaPage() {
  const { isAuthenticated, fetchCsrf, csrfToken } = useAuth();
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<string>("");

  useEffect(() => {
    if (!isAuthenticated) router.push("/");
  }, [isAuthenticated, router]);

  const onUpload = async () => {
    if (!file) { setResult("請選擇CSV檔"); return; }
    await fetchCsrf();
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/personas/upload", { method: "POST", body: fd, headers: { "x-csrf-token": csrfToken || "" } }).catch(() => null);
    if (!res) { setResult("上傳失敗"); return; }
    const data = await res.json().catch(() => ({}));
    if (data && data.ok) {
      setResult(`✅ 已匯入 ${data.total} 筆，新增 ${data.upserted}，更新 ${data.modified}`);
    } else {
      setResult(`❌ ${data?.error || "匯入失敗"}`);
    }
  };

  return (
    <div className="p-6">
      <h1 className="mb-4 text-xl font-semibold text-zinc-100">上傳人物（CSV）</h1>
      <div className="space-y-4">
        <input type="file" accept=".csv,text/csv" onChange={e => setFile(e.target.files?.[0] || null)} className="text-zinc-100" />
        <button onClick={onUpload} className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-zinc-100">上傳並匯入</button>
        {result && <div className="text-sm text-zinc-300">{result}</div>}
      </div>
    </div>
  );
}
