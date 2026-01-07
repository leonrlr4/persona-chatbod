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

  const [ttsSupported, setTtsSupported] = useState<boolean>(false);
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(true);
  const [ttsRate, setTtsRate] = useState<number>(1);
  const [ttsPitch, setTtsPitch] = useState<number>(1);
  const [ttsVolume, setTtsVolume] = useState<number>(1);
  const [ttsLang, setTtsLang] = useState<string>("");
  const [ttsVoiceURI, setTtsVoiceURI] = useState<string>("");
  const [ttsEngine, setTtsEngine] = useState<"browser" | "kokoro">("browser");
  const [ttsError, setTtsError] = useState<string | null>(null);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const spokenLenRef = useRef<Record<string, number>>({});
  const residualRef = useRef<Record<string, string>>({});
  const lastAssistantIdRef = useRef<string | number | null>(null);
  const audioQueueRef = useRef<HTMLAudioElement[]>([]);
  const playingRef = useRef<boolean>(false);

  useEffect(() => {
    try {
      const ok = typeof window !== "undefined" && "speechSynthesis" in window && "SpeechSynthesisUtterance" in window;
      setTimeout(() => setTtsSupported(ok), 0);
    } catch {
      setTimeout(() => setTtsSupported(false), 0);
    }
  }, []);

  useEffect(() => {
    if (!ttsSupported) return;
    const loadVoices = () => {
      const v = window.speechSynthesis.getVoices();
      if (v && v.length) {
        voicesRef.current = v;
        setVoices(v);

        // 優先選擇中文語音，如果沒有則使用第一個
        const preferredLang = v.find(x => x.lang && x.lang.toLowerCase().startsWith("zh"))?.lang || v[0]?.lang;

        if (!ttsLang && preferredLang) {
          setTtsLang(preferredLang);
          // 同時設置對應的語音
          const matchingVoice = v.find(x => x.lang === preferredLang);
          if (matchingVoice) {
            setTtsVoiceURI(matchingVoice.voiceURI);
          }
        } else if (!ttsVoiceURI && ttsLang) {
          // 如果已有語言但沒有語音，設置對應語音
          const matchingVoice = v.find(x => x.lang === ttsLang) || v[0];
          if (matchingVoice) {
            setTtsVoiceURI(matchingVoice.voiceURI);
          }
        }
      }
    };
    loadVoices();
    window.speechSynthesis.onvoiceschanged = loadVoices;
    return () => {
      try { if (window.speechSynthesis.onvoiceschanged === loadVoices) window.speechSynthesis.onvoiceschanged = null; } catch {}
    };
  }, [ttsSupported, ttsLang, ttsVoiceURI]);

  useEffect(() => {
    if (!ttsSupported) return;
    const v = voicesRef.current;
    if (!v.length) return;
    const current = v.find(x => x.voiceURI === ttsVoiceURI);
    if (!current || current.lang !== ttsLang) {
      const next = v.find(x => x.lang === ttsLang) || v[0];
      setTimeout(() => setTtsVoiceURI(next.voiceURI), 0);
    }
  }, [ttsLang, ttsSupported]);

  function speakSegment(text: string) {
    if (!ttsEnabled || !text.trim()) return;
    if (ttsEngine === "browser") {
      if (!ttsSupported) {
        console.warn("TTS not supported in this browser");
        return;
      }
      try {
        const u = new SpeechSynthesisUtterance(text);
        u.rate = ttsRate;
        u.pitch = ttsPitch;
        u.volume = ttsVolume;
        const v = voicesRef.current.find(x => x.voiceURI === ttsVoiceURI);
        if (v) {
          u.voice = v;
        } else {
          console.warn("TTS voice not found, using default", { ttsVoiceURI, availableVoices: voicesRef.current.length });
        }
        if (ttsLang) u.lang = ttsLang;

        // 添加錯誤處理
        u.onerror = (event) => {
          console.error("TTS error:", event);
          setTtsError(`語音播放錯誤: ${event.error}`);
        };

        console.log("TTS speaking:", { text: text.slice(0, 50), lang: u.lang, voice: v?.name });
        window.speechSynthesis.speak(u);
      } catch (err) {
        console.error("TTS speak error:", err);
        setTtsError(err instanceof Error ? err.message : String(err));
      }
    } else {
      enqueueKokoro(text);
    }
  }

  function pauseTTS() {
    if (ttsEngine === "browser") {
      if (!ttsSupported) return;
      window.speechSynthesis.pause();
    } else {
      const cur = audioQueueRef.current[0];
      try { cur?.pause(); } catch {}
    }
  }

  function resumeTTS() {
    if (ttsEngine === "browser") {
      if (!ttsSupported) return;
      window.speechSynthesis.resume();
    } else {
      startNext();
    }
  }

  function stopTTS() {
    if (ttsEngine === "browser") {
      if (!ttsSupported) return;
      window.speechSynthesis.cancel();
    } else {
      try {
        const cur = audioQueueRef.current[0];
        if (cur) { try { cur.pause(); } catch {}; try { cur.currentTime = 0; } catch {}; }
      } catch {}
      audioQueueRef.current.forEach(a => { try { URL.revokeObjectURL(a.src); } catch {} });
      audioQueueRef.current = [];
      playingRef.current = false;
    }
    spokenLenRef.current = {};
    residualRef.current = {};
    lastAssistantIdRef.current = null;
  }

  async function enqueueKokoro(text: string) {
    try {
      const lang = mapKokoroLang(ttsLang);
      const r = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang: lang || undefined, voice: ttsVoiceURI || undefined, speed: ttsRate, format: "wav" })
      });
      if (!r.ok) {
        const msg = r.status === 501 ? "KOKORO_API_URL 未設定" : `TTS 錯誤 (${r.status})`;
        setTtsError(msg);
        return;
      }
      setTtsError(null);
      if (!r.body) {
        const buf = await r.arrayBuffer();
        const blob = new Blob([buf], { type: r.headers.get("content-type") || "audio/wav" });
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.volume = Math.max(0, Math.min(1, ttsVolume));
        audio.playbackRate = Math.max(0.5, Math.min(2, ttsRate));
        audio.onended = () => {
          try { URL.revokeObjectURL(url); } catch {}
          audioQueueRef.current.shift();
          playingRef.current = false;
          startNext();
        };
        audioQueueRef.current.push(audio);
        startNext();
        return;
      }
      const reader = r.body.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      const blobParts: ArrayBuffer[] = chunks.map(c => {
        const buf = new ArrayBuffer(c.byteLength);
        const view = new Uint8Array(buf);
        view.set(c);
        return buf;
      });
      const blob = new Blob(blobParts, { type: "audio/wav" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, ttsVolume));
      audio.playbackRate = Math.max(0.5, Math.min(2, ttsRate));
      audio.onended = () => {
        try { URL.revokeObjectURL(url); } catch {}
        audioQueueRef.current.shift();
        playingRef.current = false;
        startNext();
      };
      audioQueueRef.current.push(audio);
      startNext();
    } catch {}
  }

  function startNext() {
    if (playingRef.current) return;
    const next = audioQueueRef.current[0];
    if (next) {
      playingRef.current = true;
      next.play().catch(() => {
        playingRef.current = false;
        try { audioQueueRef.current.shift(); } catch {}
        startNext();
      });
    }
  }

  function mapKokoroLang(s: string) {
    const v = (s || "").toLowerCase();
    if (!v) return "";
    if (v.startsWith("zh")) return "z";
    if (v.startsWith("en-gb")) return "b";
    if (v.startsWith("en")) return "a";
    if (v.startsWith("fr")) return "f";
    if (v.startsWith("es")) return "e";
    if (v.startsWith("pt")) return "p";
    if (v.startsWith("ja") || v === "jp") return "j";
    if (v.startsWith("hi")) return "h";
    if (v.startsWith("it")) return "i";
    return v;
  }

  useEffect(() => {
    if (!ttsEnabled) return;
    if (ttsEngine === "browser" && !ttsSupported) return;
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAssistant) return;
    const id = lastAssistant.id ?? messages.lastIndexOf(lastAssistant);
    lastAssistantIdRef.current = id;
    const prevLen = spokenLenRef.current[String(id)] || 0;
    const full = String(lastAssistant.content || "");
    if (full.length <= prevLen) return;
    const delta = full.slice(prevLen);
    const buffer = (residualRef.current[String(id)] || "") + delta;
    const parts: string[] = [];
    let start = 0;
    for (let i = 0; i < buffer.length; i++) {
      const ch = buffer[i];
      if (/[。．\.！？!\?\n]/.test(ch)) {
        const seg = buffer.slice(start, i + 1);
        if (seg.trim()) parts.push(seg);
        start = i + 1;
      }
    }
    const residual = buffer.slice(start);
    residualRef.current[String(id)] = residual;
    if (parts.length) {
      const spokenTotal = parts.join("").length;
      parts.forEach(p => speakSegment(p));
      spokenLenRef.current[String(id)] = prevLen + spokenTotal;
    }
  }, [messages, ttsEnabled, ttsSupported, ttsEngine, ttsRate, ttsPitch, ttsVolume, ttsLang, ttsVoiceURI]);

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
      try {
        const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
        win.requestIdleCallback ? win.requestIdleCallback(calc) : setTimeout(calc, 0);
      } catch { setTimeout(calc, 0); }
    } else {
      setTimeout(() => {
        setVirt(v => ({ ...v, start: 0, end: messages.length }));
      }, 0);
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
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.log("chat_ui_send_error", { message: msg });
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
        } catch (err: unknown) {
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
      const AC = (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext || window.AudioContext;
      const ctx = new AC();
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
        <div className="mt-3 rounded-2xl bg-zinc-800 px-4 py-3">
          {ttsEngine === "browser" && !ttsSupported ? (
            <div className="text-xs text-zinc-400">裝置不支援語音朗讀</div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {ttsError ? (
                <div className="rounded bg-red-900/40 px-2 py-1 text-xs text-red-300">{ttsError}</div>
              ) : null}
              <div className="flex items-center gap-1 text-xs">
                <span>引擎</span>
                <select value={ttsEngine} onChange={e => setTtsEngine(e.target.value as "browser" | "kokoro")} className="rounded bg-zinc-700 px-2 py-1">
                  <option value="browser">瀏覽器</option>
                  <option value="kokoro">Kokoro</option>
                </select>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={ttsEnabled} onChange={e => setTtsEnabled(e.target.checked)} />
                啟用TTS
              </label>
              <div className="flex items-center gap-1 text-xs">
                <span>語速</span>
                <input type="range" min={0.5} max={2} step={0.1} value={ttsRate} onChange={e => setTtsRate(Number(e.target.value))} />
              </div>
              {ttsEngine === "browser" && (
                <div className="flex items-center gap-1 text-xs">
                  <span>音調</span>
                  <input type="range" min={0} max={2} step={0.1} value={ttsPitch} onChange={e => setTtsPitch(Number(e.target.value))} />
                </div>
              )}
              <div className="flex items-center gap-1 text-xs">
                <span>音量</span>
                <input type="range" min={0} max={1} step={0.05} value={ttsVolume} onChange={e => setTtsVolume(Number(e.target.value))} />
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span>語系</span>
                {ttsEngine === "browser" ? (
                  <select value={ttsLang} onChange={e => setTtsLang(e.target.value)} className="rounded bg-zinc-700 px-2 py-1">
                    {Array.from(new Set(voices.map(v => v.lang))).map(l => (
                      <option key={l} value={l}>{l}</option>
                    ))}
                  </select>
                ) : (
                  <input value={ttsLang} onChange={e => setTtsLang(e.target.value)} placeholder="例如：en-us/zh" className="rounded bg-zinc-700 px-2 py-1 text-xs" />
                )}
              </div>
              <div className="flex items-center gap-1 text-xs">
                <span>語音</span>
                {ttsEngine === "browser" ? (
                  <select value={ttsVoiceURI} onChange={e => setTtsVoiceURI(e.target.value)} className="rounded bg-zinc-700 px-2 py-1">
                    {voices.filter(v => !ttsLang || v.lang === ttsLang).map((v, idx) => (
                      <option key={`${v.voiceURI}-${v.name}-${v.lang}-${idx}`} value={v.voiceURI}>{v.name}</option>
                    ))}
                  </select>
                ) : (
                  <input value={ttsVoiceURI} onChange={e => setTtsVoiceURI(e.target.value)} placeholder="Kokoro voice id（選填）" className="rounded bg-zinc-700 px-2 py-1 text-xs" />
                )}
              </div>
              <div className="ml-auto flex items-center gap-2">
                <button onClick={pauseTTS} className="rounded-md px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600">暫停</button>
                <button onClick={resumeTTS} className="rounded-md px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600">繼續</button>
                <button onClick={stopTTS} className="rounded-md px-2 py-1 text-xs bg-zinc-700 hover:bg-zinc-600">停止</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
