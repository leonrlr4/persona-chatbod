"use client";
import { useEffect, useRef, useState } from "react";
import { Mic, Send, Bot } from "lucide-react";

type Msg = { role: "user" | "assistant"; content: string };

export default function ChatPanel({ personaId, personaName }: { personaId: string | null; personaName?: string | null }) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const text = input.trim();
    if (!text) return;
    setInput("");
    setMessages(m => [...m, { role: "user", content: text }, { role: "assistant", content: "" }]);
    try {
      const res = await fetch("/api/chat/stream", {
        method: "POST",
        body: JSON.stringify({ personaId, text }),
        headers: { "content-type": "application/json" },
      });
      if (res.ok && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder("utf-8");
        let done = false;
        while (!done) {
          const { value, done: d } = await reader.read();
          done = d;
          if (value) {
            const chunk = decoder.decode(value);
            setMessages(m => {
              const copy = m.slice();
              const last = copy[copy.length - 1];
              copy[copy.length - 1] = { ...last, content: `${last.content}${chunk}` };
              return copy;
            });
          }
        }
        return;
      }
      const hf = await fetch("/api/chat/hf", {
        method: "POST",
        body: JSON.stringify({ personaId, text }),
        headers: { "content-type": "application/json" },
      });
      if (!hf.ok) throw new Error("hf_failed");
      const data = await hf.json();
      if (data.ok && data.response) {
        setMessages(m => {
          const copy = m.slice(0, -1);
          return [...copy, { role: "assistant", content: data.response }];
        });
      } else {
        throw new Error("no_response");
      }
    } catch {
      setMessages(m => {
        const copy = m.slice(0, -1);
        return [...copy, { role: "assistant", content: "抱歉，發生錯誤。請稍後再試。" }];
      });
    }
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
          <button aria-label="Record" className="rounded-md p-2 hover:bg-zinc-700">
            <Mic size={18} />
          </button>
          <input
            aria-label="Ask"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Ask me something"
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-400"
          />
          <button aria-label="Send" onClick={send} className="rounded-md p-2 hover:bg-zinc-700">
            <Send size={18} />
          </button>
        </div>
      </div>
    </div>
  );
}