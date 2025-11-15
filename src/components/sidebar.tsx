"use client";
import { useEffect, useMemo, useState } from "react";
import { listPersonas } from "@/utils/api";
import { Search, Bot, MessageSquare, Settings, Users, ChevronRight } from "lucide-react";

type Persona = {
  id: string;
  name: string;
};

export default function Sidebar({ onSelectPersona }: { onSelectPersona: (id: string) => void }) {
  const [q, setQ] = useState("");
  const [items, setItems] = useState<Persona[]>([]);
  const [active, setActive] = useState<string | null>(null);

  useEffect(() => {
    listPersonas().then(r => setItems(r.personas.map(p => ({ id: String(p.id), name: String(p.name) })))).catch(() => setItems([]));
  }, []);

  const filtered = useMemo(() => {
    if (!q) return items;
    const s = q.toLowerCase();
    return items.filter(i => i.name.toLowerCase().includes(s));
  }, [q, items]);

  return (
    <aside className="flex h-screen w-[300px] flex-col gap-4 border-r border-black/10 bg-black text-zinc-200">
      <div className="flex items-center gap-2 px-4 pt-4 text-lg font-semibold">
        <Bot size={20} />
        <span>Persona Chat</span>
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
            <li key={p.id}>
              <button
                aria-label={`Select ${p.name}`}
                onClick={() => {
                  setActive(p.id);
                  onSelectPersona(p.id);
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
    </aside>
  );
}