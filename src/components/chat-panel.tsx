"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Bot } from "lucide-react";
import { useChat } from "@/hooks/useChat";

export default function ChatPanel({ personaId, personaName }: { personaId: string | null; personaName?: string | null }) {
  const { messages: allMessages, isLoading, setCurrentPersona, sendMessage } = useChat();
  const key = personaId || "default";
  const messages = allMessages[key] || [];

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
  const lastSubmitRef = useRef<{ text: string; ts: number } | null>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    setCurrentPersona(personaId);
  }, [personaId, setCurrentPersona]);

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
      await sendMessage(text, personaId);
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
          {personaName && (
            <div className="flex items-center gap-1 rounded-md bg-zinc-800 px-3 py-1 text-xs text-zinc-200">
              <Bot size={14} className="text-zinc-400" />
              <span className="max-w-[180px] truncate">{personaName}</span>
            </div>
          )}
        </div>
      </header>
      <div ref={listRef} className="flex-1 overflow-y-auto px-6">
        <div className="mx-auto max-w-2xl space-y-6 py-6">
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`rounded-2xl px-4 py-3 text-sm ${m.role === "user" ? "bg-zinc-700" : "bg-zinc-800"}`}>{m.content}</div>
            </div>
          ))}
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