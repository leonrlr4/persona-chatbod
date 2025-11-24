"use client";
import { useState } from "react";
import { X, Upload } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function UploadModal({ isOpen, onClose }: UploadModalProps) {
  const { isAuthenticated } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [result, setResult] = useState<string>("");

  if (!isOpen) return null;

  const onUpload = async () => {
    if (!isAuthenticated) {
      setResult("請先登入");
      return;
    }
    const hasFile = !!file;
    const hasText = text.trim().length > 0;
    if (!hasFile && !hasText) {
      setResult("請選擇CSV檔或貼上CSV內容");
      return;
    }
    setIsUploading(true);
    setResult("");
    try {
      const fd = new FormData();
      if (hasFile && file) fd.append("file", file);
      if (!hasFile && hasText) fd.append("text", text);
      const res = await fetch("/api/personas/upload", { method: "POST", body: fd });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data && data.ok) {
        setResult(`已匯入 ${data.total || 0} 筆，新增 ${data.upserted || 0}，更新 ${data.modified || 0}`);
        try { window.dispatchEvent(new CustomEvent("personas:updated")); } catch {}
        setFile(null);
        setText("");
      } else {
        setResult(String(data?.error || "匯入失敗"));
      }
    } catch {
      setResult("上傳失敗");
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-lg border border-zinc-800 bg-zinc-900 p-6 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-100">上傳人物（CSV）</h2>
          <button onClick={onClose} className="rounded-md p-1 text-zinc-400 hover:bg-zinc-800 hover:text-zinc-200">
            <X size={20} />
          </button>
        </div>
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Upload size={16} className="text-zinc-400" />
            <input
              type="file"
              accept=".csv,text/csv"
              onChange={e => setFile(e.target.files?.[0] || null)}
              className="text-zinc-100"
            />
          </div>
          <div>
            <textarea
              value={text}
              onChange={e => setText(e.target.value)}
              placeholder="或貼上CSV文字內容"
              className="h-32 w-full rounded-md border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-600 focus:outline-none"
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onUpload}
              disabled={isUploading}
              className="rounded-md bg-zinc-700 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isUploading ? "上傳中…" : "上傳並匯入"}
            </button>
            <button onClick={onClose} className="rounded-md bg-zinc-800 px-4 py-2 text-sm text-zinc-100 hover:bg-zinc-700">關閉</button>
          </div>
          {result && <div className="text-sm text-zinc-300">{result}</div>}
        </div>
      </div>
    </div>
  );
}
