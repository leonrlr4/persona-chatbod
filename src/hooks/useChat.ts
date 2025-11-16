"use client";
import { create } from "zustand";

export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

interface ChatState {
  messages: Record<string, Message[]>; // personaId -> messages
  currentPersonaId: string | null;
  isLoading: boolean;
  error: string | null;

  setCurrentPersona: (personaId: string | null) => void;
  loadMessages: (personaId: string | null) => Promise<void>;
  sendMessage: (text: string, personaId: string | null) => Promise<void>;
  clearMessages: (personaId: string | null) => void;
}

export const useChat = create<ChatState>((set, get) => ({
  messages: {},
  currentPersonaId: null,
  isLoading: false,
  error: null,

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
        const parsed = JSON.parse(cached) as Message[];
        if (Array.isArray(parsed)) {
          set(state => ({
            messages: { ...state.messages, [key]: parsed }
          }));
          return;
        }
      }
    } catch {}

    // Fallback to empty
    set(state => ({
      messages: { ...state.messages, [key]: [] }
    }));
  },

  sendMessage: async (text: string, personaId: string | null) => {
    const key = personaId || "default";
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
      isLoading: true,
      error: null
    }));

    try {
      // Try non-streaming API first
      const hfRes = await fetch("/api/chat/hf", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, text })
      });

      if (hfRes.ok) {
        const data = await hfRes.json();
        if (data.ok && data.response) {
          const finalMsg = { ...assistantMsg, content: data.response };
          set(state => {
            const msgs = [...(state.messages[key] || [])];
            msgs[msgs.length - 1] = finalMsg;
            const updated = { ...state.messages, [key]: msgs };
            // Save to localStorage
            try {
              localStorage.setItem(`chat_history:${key}`, JSON.stringify(msgs));
            } catch {}
            return { messages: updated, isLoading: false };
          });
          return;
        }
      }

      // Fallback to streaming
      const streamRes = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ personaId, text })
      });

      if (!streamRes.body) throw new Error("No stream body");

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
        return { isLoading: false };
      });

    } catch (err: any) {
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
          isLoading: false,
          error: String(err?.message || err)
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
  }
}));
