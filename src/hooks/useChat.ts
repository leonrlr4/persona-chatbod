"use client";
import { create } from "zustand";

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

export interface ConversationSummary {
  id: string;
  personaId: string | null;
  personaName: string | null;
  createdAt: Date;
  updatedAt: Date;
  lastMessage: {
    content: string;
    timestamp: number;
    role: string;
  } | null;
}

interface ChatState {
  messages: Record<string, Message[]>; // personaId -> messages
  currentPersonaId: string | null;
  currentConversationId: string | null;
  conversations: ConversationSummary[];
  isLoading: boolean;
  error: string | null;
  errorCode?: number | null;
  paging: Record<string, { hasMore: boolean; lastLoadedTs: number | null; pageSize: number }>;

  setCurrentPersona: (personaId: string | null) => void;
  loadMessages: (personaId: string | null) => Promise<void>;
  sendMessage: (text: string, personaId: string | null) => Promise<void>;
  clearMessages: (personaId: string | null) => void;

  // conversation management
  fetchConversations: () => Promise<void>;
  loadConversation: (conversationId: string) => Promise<void>;
  loadMoreMessages: (conversationId: string) => Promise<void>;
  deleteConversation: (conversationId: string) => Promise<void>;
  startNewConversation: () => void;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: {},
  currentPersonaId: null,
  currentConversationId: null,
  conversations: [],
  isLoading: false,
  error: null,
  errorCode: null,
  paging: {},

  setCurrentPersona: (personaId: string | null) => {
    set({ currentPersonaId: personaId });
    get().loadMessages(personaId);
  },

  loadMessages: async (personaId: string | null) => {
    const key = personaId || "default";

    // Try localStorage first
    try {
      const cached = localStorage.getItem(`chat_history:${key}`);
      if (cached) {
        const worker = createParserWorker();
        if (worker) {
          const res = await parseInWorker(worker, cached);
          if (Array.isArray(res)) {
            set(state => ({ messages: { ...state.messages, [key]: res as Message[] } }));
            worker.terminate();
            return;
          }
          worker.terminate();
        } else {
          const parsed = JSON.parse(cached) as Message[];
          if (Array.isArray(parsed)) {
            set(state => ({ messages: { ...state.messages, [key]: parsed } }));
            return;
          }
        }
      }
    } catch {}

    // Fallback to empty
    set(state => ({
      messages: { ...state.messages, [key]: [] }
    }));
  },

  sendMessage: async (text: string, personaId: string | null) => {
    const { currentConversationId } = get();
    const key = currentConversationId || "default";

    const userMsg: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: text,
      timestamp: Date.now()
    };
    const assistantMsg: Message = {
      id: `assistant-${Date.now()}`,
      role: "assistant",
      content: "",
      timestamp: Date.now()
    };

    // Add user message and empty assistant message
    set(state => ({
      messages: {
        ...state.messages,
        [key]: [...(state.messages[key] || []), userMsg, assistantMsg]
      },
      error: null
    }));

    try {
      const streamRes = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          personaId,
          text,
          conversationId: currentConversationId
        })
      });

      if (!streamRes.body) throw new Error("No stream body");

      // Get conversationId from response headers
      const newConversationId = streamRes.headers.get("X-Conversation-Id");

      const reader = streamRes.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });

        set(state => {
          const msgs = [...(state.messages[key] || [])];
          msgs[msgs.length - 1] = { ...assistantMsg, content: acc };
          return { messages: { ...state.messages, [key]: msgs } };
        });
      }

      // Save final result
      set(state => {
        const msgs = state.messages[key] || [];
        try {
          localStorage.setItem(`chat_history:${key}`, JSON.stringify(msgs));
        } catch {}
        const newConvId = newConversationId || state.currentConversationId;
        const needsMove = newConvId && newConvId !== state.currentConversationId && key === "default";

        // Move messages from "default" to new conversation key
        const finalMessages = needsMove
          ? { ...state.messages, [newConvId]: msgs }
          : state.messages;

        // Refresh conversations if new conversation was created
        if (newConvId && newConvId !== state.currentConversationId) {
          get().fetchConversations();
        }

        return {
          messages: finalMessages,
          currentConversationId: newConvId
        };
      });

    } catch (err: unknown) {
      const errorMsg = { ...assistantMsg, content: "抱歉，發生錯誤。請稍後再試。" };
      set(state => {
        const msgs = [...(state.messages[key] || [])];
        msgs[msgs.length - 1] = errorMsg;
        const updated = { ...state.messages, [key]: msgs };
        try {
          localStorage.setItem(`chat_history:${key}`, JSON.stringify(msgs));
        } catch {}
        return {
          messages: updated,
          error: err instanceof Error ? err.message : String(err)
        };
      });
    }
  },

  clearMessages: (personaId: string | null) => {
    const key = personaId || "default";
    set(state => ({
      messages: { ...state.messages, [key]: [] }
    }));
    try {
      localStorage.removeItem(`chat_history:${key}`);
    } catch {}
  },

  fetchConversations: async () => {
    try {
      const res = await fetch("/api/conversations");
      if (!res.ok) {
        if (res.status === 401) {
          set({ conversations: [] });
          return;
        }
        throw new Error("Failed to fetch conversations");
      }
      const data = await res.json();
      const apply = () => set({ conversations: data.conversations || [] });
      try {
        const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
        win.requestIdleCallback ? win.requestIdleCallback(apply) : apply();
      } catch {
        apply();
      }
    } catch (err: unknown) {
      console.error("Error fetching conversations:", err);
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  loadConversation: async (conversationId: string) => {
    const setError = (err: unknown) => {
      const domErrName = err instanceof Error ? String(err.name) : "";
      const code = domErrName === "UnknownError" ? 3 : domErrName === "VersionError" ? 11 : null;
      set({ error: err instanceof Error ? err.message : String(err), errorCode: code, isLoading: false });
    };
    try {
      // Clear existing messages for this conversation to prevent duplication
      set(state => ({
        messages: { ...state.messages, [conversationId]: [] },
        isLoading: true,
        error: null,
        errorCode: null
      }));

      const db = await openDB();
      const hasIDB = !!db;
      let personaId: string | null = null;
      let initial: Message[] = [];
      if (hasIDB) {
        const meta = await fetchConversationMeta(conversationId);
        personaId = meta?.personaId || null;
        initial = await getLatestMessages(conversationId, 50);
        if (!meta || initial.length === 0) {
          const fallback = await loadConversationFromServer(conversationId);
          personaId = fallback.personaId;
          initial = fallback.messages;
          try {
            await saveMessagesBulk(conversationId, initial);
          } catch {}
        }
      } else {
        const fallback = await loadConversationFromServer(conversationId);
        personaId = fallback.personaId;
        initial = fallback.messages;
      }

      const key = conversationId;
      // Deduplicate messages by id and timestamp
      const uniqueMessages = Array.from(
        new Map(initial.map(m => [`${m.id}-${m.timestamp}`, m])).values()
      );
      const applyInitial = () => set(state => ({
        messages: { ...state.messages, [key]: uniqueMessages },
        currentPersonaId: personaId,
        currentConversationId: conversationId,
        isLoading: false,
        paging: { ...state.paging, [conversationId]: { hasMore: true, lastLoadedTs: uniqueMessages.length ? uniqueMessages[0].timestamp || null : null, pageSize: 50 } }
      }));
      try {
        const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
        win.requestIdleCallback ? win.requestIdleCallback(applyInitial) : applyInitial();
      } catch { applyInitial(); }

      if (hasIDB) {
        const total = await countMessages(conversationId);
        if (total <= 100) return;
        queueProgressiveHydration(conversationId, key, initial);
      }
    } catch (err: unknown) {
      console.error("Error loading conversation:", err);
      setError(err);
    }
  },

  loadMoreMessages: async (conversationId: string) => {
    try {
      const p = get().paging[conversationId];
      if (!p || !p.hasMore) return;
      const before = p.lastLoadedTs || Number.MAX_SAFE_INTEGER;
      const batch = await getOlderMessages(conversationId, before, p.pageSize);
      if (!batch.length) {
        set(state => ({ paging: { ...state.paging, [conversationId]: { ...p, hasMore: false } } }));
        return;
      }
      const key = conversationId;
      set(state => {
        const existing = state.messages[key] || [];
        const merged = [...batch, ...existing];
        // Deduplicate by id and timestamp
        const unique = Array.from(
          new Map(merged.map(m => [`${m.id}-${m.timestamp}`, m])).values()
        );
        return {
          messages: { ...state.messages, [key]: unique },
          paging: { ...state.paging, [conversationId]: { ...p, lastLoadedTs: batch[0].timestamp || p.lastLoadedTs } }
        };
      });
    } catch (err: unknown) {
      console.error("Error loading more messages:", err);
      const domErrName = err instanceof Error ? String(err.name) : "";
      const code = domErrName === "UnknownError" ? 3 : domErrName === "VersionError" ? 11 : null;
      set({ error: err instanceof Error ? err.message : String(err), errorCode: code });
    }
  },

  deleteConversation: async (conversationId: string) => {
    try {
      const res = await fetch(`/api/conversations/${conversationId}`, {
        method: "DELETE"
      });
      if (!res.ok) throw new Error("Failed to delete conversation");

      // remove from conversations list
      set(state => ({
        conversations: state.conversations.filter(c => c.id !== conversationId),
        currentConversationId: state.currentConversationId === conversationId
          ? null
          : state.currentConversationId
      }));

      // refresh conversations
      await get().fetchConversations();
    } catch (err: unknown) {
      console.error("Error deleting conversation:", err);
      set({ error: err instanceof Error ? err.message : String(err) });
    }
  },

  startNewConversation: () => {
    set({ currentConversationId: null });
    const { currentPersonaId } = get();
    if (currentPersonaId) {
      const key = "default";
      set(state => ({
        messages: { ...state.messages, [key]: [] }
      }));
    }
  }
}));

// IndexedDB helpers
let _dbPromise: Promise<IDBDatabase | null> | null = null;
function openDB(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open("persona_chatbot", 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains("messages")) {
          const store = db.createObjectStore("messages", { keyPath: "id" });
          store.createIndex("conv", "conversationId", { unique: false });
          store.createIndex("conv_ts", ["conversationId", "timestamp"], { unique: false });
        }
        if (!db.objectStoreNames.contains("conversations")) {
          const c = db.createObjectStore("conversations", { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return _dbPromise;
}

async function fetchConversationMeta(conversationId: string): Promise<{ id: string; personaId: string | null } | null> {
  const db = await openDB();
  if (!db) return null;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("conversations", "readonly");
      const store = tx.objectStore("conversations");
      const req = store.get(conversationId);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function saveConversationMeta(meta: { id: string; personaId: string | null }) {
  const db = await openDB();
  if (!db) return;
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction("conversations", "readwrite");
      const store = tx.objectStore("conversations");
      store.put(meta);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}

async function saveMessagesBulk(conversationId: string, msgs: Message[]) {
  const db = await openDB();
  if (!db) return;
  return new Promise<void>((resolve, reject) => {
    try {
      const tx = db.transaction("messages", "readwrite");
      const store = tx.objectStore("messages");
      for (const m of msgs) {
        store.put({ id: `${conversationId}:${m.timestamp}:${m.id || Math.random()}`, conversationId, role: m.role, content: m.content, timestamp: m.timestamp || Date.now() });
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    } catch (e) { reject(e); }
  });
}

async function getLatestMessages(conversationId: string, limit: number): Promise<Message[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const idx = store.index("conv_ts");
      const range = IDBKeyRange.bound([conversationId, 0], [conversationId, Number.MAX_SAFE_INTEGER]);
      const cursorReq = idx.openCursor(range, "prev");
      const out: Message[] = [];
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && out.length < limit) {
          const v = cursor.value;
          out.push({ id: v.id, role: v.role, content: v.content, timestamp: v.timestamp });
          cursor.continue();
        } else {
          resolve(out.reverse());
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    } catch (e) { reject(e); }
  });
}

async function getOlderMessages(conversationId: string, beforeTs: number, limit: number): Promise<Message[]> {
  const db = await openDB();
  if (!db) return [];
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const idx = store.index("conv_ts");
      const range = IDBKeyRange.bound([conversationId, 0], [conversationId, beforeTs]);
      const cursorReq = idx.openCursor(range, "prev");
      const out: Message[] = [];
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor && out.length < limit) {
          const v = cursor.value;
          out.push({ id: v.id, role: v.role, content: v.content, timestamp: v.timestamp });
          cursor.continue();
        } else {
          resolve(out.reverse());
        }
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    } catch (e) { reject(e); }
  });
}

async function countMessages(conversationId: string): Promise<number> {
  const db = await openDB();
  if (!db) return 0;
  return new Promise((resolve, reject) => {
    try {
      const tx = db.transaction("messages", "readonly");
      const store = tx.objectStore("messages");
      const idx = store.index("conv");
      const req = idx.count(IDBKeyRange.only(conversationId));
      req.onsuccess = () => resolve(req.result || 0);
      req.onerror = () => reject(req.error);
    } catch (e) { reject(e); }
  });
}

async function loadConversationFromServer(conversationId: string): Promise<{ personaId: string | null; messages: Message[] }> {
  const res = await fetch(`/api/conversations/${conversationId}`);
  if (!res.ok) throw new Error("Failed to load conversation");
  const data = await res.json();
  const { conversation, messages } = data;
  try { await saveConversationMeta({ id: conversation.id, personaId: conversation.personaId || null }); } catch {}
  return { personaId: conversation.personaId || null, messages };
}

function queueProgressiveHydration(conversationId: string, key: string, initial: Message[]) {
  // progressively hydrate rest messages in idle time
  const run = async () => {
    try {
      let before = initial.length ? initial[0].timestamp || Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER;
      let hasMore = true;
      let iterations = 0;
      const maxIterations = 50; // Prevent infinite loop

      while (hasMore && iterations < maxIterations) {
        // Check if still viewing this conversation
        const currentState = useChat.getState();
        if (currentState.currentConversationId !== conversationId) {
          break; // Stop loading if user switched to another conversation
        }

        iterations++;
        const batch = await getOlderMessages(conversationId, before, 200);
        if (!batch.length) { hasMore = false; break; }

        useChat.setState(state => {
          // Double-check we're still viewing this conversation
          if (state.currentConversationId !== conversationId) {
            return state;
          }

          const existing = state.messages[key] || [];
          const merged = [...batch, ...existing];
          // Deduplicate by id and timestamp
          const unique = Array.from(
            new Map(merged.map(m => [`${m.id}-${m.timestamp}`, m])).values()
          );
          return { messages: { ...state.messages, [key]: unique } };
        });

        // Update before to just before the oldest message timestamp to avoid duplicates
        const oldestTimestamp = batch[0].timestamp;
        if (oldestTimestamp && oldestTimestamp < before) {
          before = oldestTimestamp - 1;
        } else {
          hasMore = false; // Prevent infinite loop if timestamp doesn't decrease
        }
      }
    } catch {}
  };
  try {
    const win = window as unknown as { requestIdleCallback?: (cb: () => void) => void };
    win.requestIdleCallback ? win.requestIdleCallback(run) : setTimeout(run, 0);
  } catch {
    setTimeout(run, 0);
  }
}

// Web Worker for JSON parsing
function createParserWorker(): Worker | null {
  try {
    const code = `self.onmessage = function(e){ try { const data = JSON.parse(e.data); self.postMessage({ ok: Array.isArray(data), data }); } catch(err) { self.postMessage({ ok: false, error: String(err && err.message || err) }); } };`;
    const blob = new Blob([code], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    return new Worker(url);
  } catch {
    return null;
  }
}

function parseInWorker(worker: Worker, text: string): Promise<unknown> {
  return new Promise(resolve => {
    const onMsg = (ev: MessageEvent) => {
      try { worker.removeEventListener("message", onMsg); } catch {}
      const payload = ev.data || {};
      resolve(payload.ok ? payload.data : null);
    };
    worker.addEventListener("message", onMsg);
    worker.postMessage(text);
  });
}
