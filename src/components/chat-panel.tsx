"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Bot } from "lucide-react";
import { useChat } from "@/hooks/useChat";

export default function ChatPanel({ personaId, personaName }: { personaId: string | null; personaName?: string | null }) {
  const { messages: allMessages, isLoading, setCurrentPersona, sendMessage, currentConversationId, currentPersonaId, loadMoreMessages, error, errorCode, clearMessages, loadConversation, conversations } = useChat();
  const activeKey = currentConversationId || "default";
  const messages = allMessages[activeKey] || [];
  const derivedPersonaName = (() => {
    const c = conversations.find(c => c.id === currentConversationId);
    return c?.personaName || personaName || null;
  })();

  const [input, setInput] = useState("");
  const [recording, setRecording] = useState(false);
  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const silentAccumRef = useRef<number>(0);
  const lastTickRef = useRef<number>(0);
  const manualStopRef = useRef<boolean>(false);
  const countdownRef = useRef<number | null>(null);
  const [status, setStatus] = useState<"idle" | "recording" | "processing" | "countdown" | "sending" | "error">("idle");
  const [countdown, setCountdown] = useState<number>(0);
  const listRef = useRef<HTMLDivElement>(null);
  const [virt, setVirt] = useState<{ start: number; end: number; itemH: number }>({ start: 0, end: 50, itemH: 56 });
  const lastSubmitRef = useRef<{ text: string; ts: number } | null>(null);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight });
    if (messages.length > 100) {
      const calc = () => {
        const h = virt.itemH;
        const viewport = el.clientHeight;
        const visible = Math.max(10, Math.ceil(viewport / h) + 20);
        setVirt(v => ({ ...v, end: v.start + visible }));
      };
      try { (window as any).requestIdleCallback ? (window as any).requestIdleCallback(calc) : setTimeout(calc, 0); } catch { setTimeout(calc, 0); }
    } else {
      setVirt(v => ({ ...v, start: 0, end: messages.length }));
    }
  }, [messages.length, activeKey]);


  function onScroll() {
    const el = listRef.current;
    if (!el) return;
    const top = el.scrollTop;
    if (top <= 8 && currentConversationId) {
      loadMoreMessages(currentConversationId);
    }
    if (messages.length > 100) {
      const h = virt.itemH;
      const start = Math.max(0, Math.floor(top / h) - 10);
      const viewport = el.clientHeight;
      const visible = Math.max(10, Math.ceil(viewport / h) + 20);
      const end = Math.min(messages.length, start + visible);
      setVirt(s => ({ ...s, start, end }));
    }
  }

  async function send(textParam?: string, source?: string) {
    const raw = textParam !== undefined ? textParam : input;
    const text = String(raw).trim();
    if (!text) return;

    console.log("chat_ui_send", { source: source || "unknown", len: text.length, preview: text.slice(0, 100) });
    const now = Date.now();
    if (lastSubmitRef.current && lastSubmitRef.current.text === text && now - lastSubmitRef.current.ts < 1500) {
      console.log("chat_ui_send_dedup", { source: source || "unknown" });
      return;
    }
    lastSubmitRef.current = { text, ts: now };
    setInput("");
    setStatus("sending");

    try {
      await sendMessage(text, currentPersonaId);
      setStatus("idle");
    } catch (err: any) {
      console.log("chat_ui_send_error", { message: String(err?.message || err) });
      setStatus("error");
    }
  }

  async function toggleRecord() {
    try {
      if (recording) {
        manualStopRef.current = true;
        recRef.current?.stop();
        return;
      }
      setStatus("recording");
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { noiseSuppression: true, echoCancellation: true } });
      streamRef.current = stream;
      const mr = new MediaRecorder(stream);
      const chunks: BlobPart[] = [];
      mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
      mr.onstop = async () => {
        cleanupAudio();
        setRecording(false);
        if (manualStopRef.current) {
          manualStopRef.current = false;
          setStatus("idle");
          return;
        }
        setStatus("processing");
        const blob = new Blob(chunks, { type: "audio/webm" });
        const fd = new FormData();
        fd.append("file", blob, "audio.webm");
        try {
          const ac = new AbortController();
          const to = setTimeout(() => ac.abort(), 15000);
          const r = await fetch("/api/stt", { method: "POST", body: fd, signal: ac.signal });
          clearTimeout(to);
          if (r.ok) {
            const j = await r.json();
            const text: string = String(j?.text || "");
            console.log("chat_ui_auto_submit", { len: text.length, preview: text.slice(0, 100) });
            await send(text, "auto");
            return;
          } else {
            setStatus("error");
          }
        } catch (err: any) {
          setStatus("error");
        }
      };
      recRef.current = mr;
      setRecording(true);
      mr.start();
      await setupVAD(stream);
    } catch {}
  }

  async function setupVAD(stream: MediaStream) {
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioCtxRef.current = ctx;
      try { await ctx.resume(); } catch {}
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      analyserRef.current = analyser;
      source.connect(analyser);
      const data = new Uint8Array(analyser.fftSize);
      silentAccumRef.current = 0;
      lastTickRef.current = performance.now();
      let noiseFloor = 0.02;
      const margin = 0.01;
      const maxSilentMs = 1500;
      const loop = () => {
        if (!analyserRef.current || recRef.current?.state !== "recording") return;
        analyserRef.current.getByteTimeDomainData(data);
        let amp = 0;
        for (let i = 0; i < data.length; i++) {
          amp += Math.abs(data[i] - 128);
        }
        amp = amp / (data.length * 128);
        if (amp < noiseFloor + margin) {
          noiseFloor = noiseFloor * 0.95 + amp * 0.05;
        }
        const now = performance.now();
        const delta = now - lastTickRef.current;
        lastTickRef.current = now;
        if (amp <= noiseFloor + margin) {
          silentAccumRef.current += delta;
          if (silentAccumRef.current >= maxSilentMs) {
            recRef.current?.stop();
            return;
          }
        } else {
          silentAccumRef.current = 0;
        }
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
    } catch {}
  }

  function cleanupAudio() {
    try { analyserRef.current?.disconnect(); } catch {}
    try { audioCtxRef.current?.close(); } catch {}
    analyserRef.current = null;
    audioCtxRef.current = null;
    const s = streamRef.current;
    if (s) {
      s.getTracks().forEach(t => { try { t.stop(); } catch {} });
    }
    streamRef.current = null;
  }

  function startCountdown(snapshot?: string) {
    setCountdown(3);
    if (countdownRef.current) { window.clearInterval(countdownRef.current); countdownRef.current = null; }
    countdownRef.current = window.setInterval(async () => {
      setCountdown(c => {
        const n = c - 1;
        if (n <= 0) {
          if (countdownRef.current) { window.clearInterval(countdownRef.current); countdownRef.current = null; }
          setStatus("idle");
          console.log("chat_ui_countdown_fire");
          send(snapshot, "countdown");
          return 0;
        }
        console.log("chat_ui_countdown_tick", { n });
        return n;
      });
    }, 1000);
  }

  function cancelAutoSubmit() {
    if (countdownRef.current) { window.clearInterval(countdownRef.current); countdownRef.current = null; }
    setStatus("idle");
  }

  return (
    <div className="flex h-screen flex-1 flex-col bg-gradient-to-br from-zinc-900 to-zinc-950 text-zinc-100">
      <header className="flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-2">
          <div className="rounded-md bg-zinc-800 px-3 py-1 text-xs">Beta</div>
          {derivedPersonaName && (
            <div className="flex items-center gap-1 rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200">
              <Bot size={14} className="text-zinc-400" />
              <span className="max-w-[180px] truncate">{derivedPersonaName}</span>
            </div>
          )}
        </div>
      </header>
      <div ref={listRef} onScroll={onScroll} className="relative flex-1 overflow-y-auto px-6" aria-live="polite">
        {isLoading && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <div className="animate-pulse rounded-md bg-zinc-800/70 px-3 py-2 text-sm">正在載入歷史對話…</div>
          </div>
        )}
        <div className="mx-auto max-w-2xl py-6">
          {messages.length > 100 ? (
            <div style={{ height: messages.length * virt.itemH }}>
              <div style={{ transform: `translateY(${virt.start * virt.itemH}px)` }} className="space-y-6">
                {messages.slice(virt.start, virt.end).map((m, i) => (
                  <div key={`${virt.start + i}-${m.id || i}`} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-zinc-700" : "bg-zinc-800"}`}>{m.content}</div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                  <div className={`rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-zinc-700" : "bg-zinc-800"}`}>{m.content}</div>
                </div>
              ))}
            </div>
          )}
          {!!error && (
            <div className="mt-4 flex items-center gap-2 text-sm text-red-400">
              <span>{error}</span>
              <button
                onClick={() => { if (currentConversationId) { loadConversation(currentConversationId); } }}
                className="rounded bg-red-900/40 px-2 py-1 hover:bg-red-800/60"
              >
                重試載入
              </button>
              {errorCode ? (
                <button
                  onClick={() => {
                    // 恢復默認值（清空目前視窗）
                    clearMessages(currentPersonaId || null);
                  }}
                  className="rounded bg-zinc-800 px-2 py-1 hover:bg-zinc-700"
                >
                  恢復默認值
                </button>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <div className="mx-auto w-full max-w-2xl px-6 pb-6">
        <div className="flex items-center gap-2 rounded-2xl bg-zinc-800 px-4 py-3">
          <button aria-label="Record" onClick={toggleRecord} className={`rounded-md p-2 ${recording ? "bg-red-700" : "hover:bg-zinc-700"}`}>
            <Mic size={18} />
          </button>
          {status !== "idle" && (
            <div className="text-xs text-zinc-300">
              {status === "recording" && "錄音中…（偵測靜音以自動結束）"}
              {status === "processing" && "語音轉文字中…"}
              {status === "countdown" && `即將自動送出（${countdown}s）`}
              {status === "sending" && "傳送中…"}
              {status === "error" && "發生錯誤，請重試"}
            </div>
          )}
          {status === "countdown" && (
            <button aria-label="Cancel" onClick={cancelAutoSubmit} className="rounded-md px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600">取消自動提交</button>
          )}
          <input
            aria-label="Ask"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask me something"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <button aria-label="Send" onClick={() => send(undefined, "button")} className="rounded-md p-2 hover:bg-zinc-700">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}