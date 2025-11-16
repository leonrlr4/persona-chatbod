"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import { listPersonas } from "@/utils/api";
import { Search, Bot, MessageSquare, Settings, Users, ChevronRight, LogIn, LogOut, User, Pin, X } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import AuthModal from "./auth-modal";

type Persona = {
  id: string;
  name: string;
  story?: string;
  traits?: string[];
  beliefs?: string[];
};

export default function Sidebar({ onSelectPersona }: { onSelectPersona: (id: string, name: string) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Persona[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const { user, isAuthenticated, logout, refreshMe, shouldPromptLogin, ackPromptLogin } = useAuth();
  const hideTimer = useRef<number | null>(null);
  const [pinned, setPinned] = useState<{ id: string; top: number; left: number; w: number; h: number } | null>(null);

  useEffect(() => {
    listPersonas()
      .then(r =>
        setItems(
          r.personas.map(p => ({
            id: String(p.id),
            name: String(p.name),
            story: typeof p.story === "string" ? p.story : "",
            traits: Array.isArray(p.traits) ? p.traits.map((t: any) => String(t)) : [],
            beliefs: Array.isArray(p.beliefs) ? p.beliefs.map((b: any) => String(b)) : [],
          }))
        )
      )
      .catch(() => setItems([]));
    refreshMe();
  }, [refreshMe]);

  useEffect(() => {
    const id = window.setInterval(() => {
      refreshMe();
    }, 60000);
    return () => clearInterval(id);
  }, [refreshMe]);

  useEffect(() => {
    if (shouldPromptLogin) {
      setShowAuthModal(true);
    }
  }, [shouldPromptLogin]);

  const filtered = useMemo(() => {
    if (!q) return items;
    const s = q.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(s));
  }, [q, items]);

  const detailPersona = useMemo(() => {
    if (!pinned) return null;
    return items.find(i => i.id === pinned.id) || null;
  }, [pinned, items]);

  const selected = useMemo(() => {
    if (!active) return null;
    return items.find(i => i.id === active) || null;
  }, [active, items]);

  return (
    <aside className="relative flex h-screen min-w-[240px] w-[260px] sm:w-[260px] md:w-[280px] lg:w-[300px] xl:w-[320px] flex-col gap-4 border-r border-black/10 bg-black text-zinc-200">
      <div className="flex items-center gap-2 px-4 pt-4 text-lg font-semibold">
        <Bot size={20} />
        <span>Bible Persona Chat</span>
      </div>
      <div className="px-4">
        <div className="flex items-center gap-2 rounded-md bg-zinc-900 px-3 py-2 ring-1 ring-white/10">
          <Search size={16} className="text-zinc-400" />
          <input aria-label="Search" value={q} onChange={e => setQ(e.target.value)} placeholder="Search" className="flex-1 bg-transparent text-sm outline-none placeholder:text-zinc-500" />
        </div>
      </div>
      <div className="px-4 text-xs uppercase text-zinc-400">Settings</div>
      <nav className="flex flex-col gap-2 px-2">
        <a className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-900" href="#">
          <MessageSquare size={16} />
          <span>Chats</span>
        </a>
        <a className="flex items-center gap-2 rounded-md px-3 py-2 hover:bg-zinc-900" href="#">
          <Settings size={16} />
          <span>Settings</span>
        </a>
      </nav>
      <div className="px-4 text-xs uppercase text-zinc-400">Personas</div>
      <div className="flex-1 overflow-y-auto px-2">
        <ul className="flex flex-col">
          {filtered.map(p => (
            <li
              key={p.id}
              className="relative"
            >
              <button
                aria-label={`Select ${p.name}`}
                onClick={e => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  const gap = 8;
                  const margin = 16;
                  const vh = typeof window !== "undefined" ? window.innerHeight : 800;
                  const availableW = r.width - gap * 2;
                  const panelW = Math.max(220, Math.min(availableW, 300));
                  const panelH = 420;
                  const left = Math.max(margin, r.left + gap);
                  const top = Math.min(Math.max(margin, r.top), vh - panelH - margin);
                  setPinned({ id: p.id, top, left, w: panelW, h: panelH });
                  setActive(p.id);
                  onSelectPersona(p.id, p.name);
                }}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-zinc-900 ${active === p.id ? "bg-zinc-900" : ""}`}
              >
                <span className="truncate">{p.name}</span>
                <ChevronRight size={16} className="text-zinc-500" />
              </button>
            </li>
          ))}
          {filtered.length === 0 && (
            <li className="px-3 py-2 text-sm text-zinc-500">No personas</li>
          )}
        </ul>
      </div>
      
      {/* 用戶登入區域 */}
      <div className="border-t border-zinc-800 p-4">
        {isAuthenticated ? (
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm text-zinc-300">
              <User size={16} />
              <span>{user?.name}</span>
            </div>
            <button
              onClick={logout}
              className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
            >
              <LogOut size={16} />
              <span>登出</span>
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAuthModal(true)}
            className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-zinc-300 hover:bg-zinc-900"
          >
            <LogIn size={16} />
            <span>登入 / 註冊</span>
          </button>
        )}
      </div>

      <AuthModal
        isOpen={showAuthModal}
        onClose={() => { setShowAuthModal(false); ackPromptLogin(); }}
      />

      {detailPersona && pinned && (
        <div
          className="fixed z-50 flex flex-col overflow-hidden rounded-lg border border-white/10 bg-zinc-900 shadow-xl"
          style={{ top: pinned.top, left: pinned.left, width: pinned.w, height: pinned.h }}
        >
          <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
            <div className="text-sm font-semibold">{detailPersona.name}</div>
            <div className="flex items-center gap-1">
              <button
                aria-label="Pin"
                onClick={() => {
                  const pos = pinned;
                  if (!pos) return;
                  setPinned(prev => (prev ? null : pos));
                }}
                className={`rounded p-1 ${pinned ? "bg-zinc-800" : "hover:bg-zinc-800"}`}
              >
                <Pin size={14} className="text-zinc-400" />
              </button>
              <button
                aria-label="Close"
                onClick={() => {
                  setPinned(null);
                }}
                className="rounded p-1 hover:bg-zinc-800"
              >
                <X size={14} className="text-zinc-400" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            <div className="mt-2 text-xs whitespace-pre-line text-zinc-300">
              {detailPersona.story && detailPersona.story.trim().length > 0 ? detailPersona.story : "無詳細資料"}
            </div>
            {!!(detailPersona.traits && detailPersona.traits.length) && (
              <div className="mt-3">
                <div className="text-xs uppercase text-zinc-500">Traits</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {detailPersona.traits.slice(0, 24).map(t => (
                    <span key={t} className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{t}</span>
                  ))}
                </div>
              </div>
            )}
            {!!(detailPersona.beliefs && detailPersona.beliefs.length) && (
              <div className="mt-3">
                <div className="text-xs uppercase text-zinc-500">Beliefs</div>
                <div className="mt-1 flex flex-wrap gap-1">
                  {detailPersona.beliefs.slice(0, 24).map(b => (
                    <span key={b} className="rounded bg-zinc-800 px-2 py-0.5 text-[11px] text-zinc-300">{b}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}