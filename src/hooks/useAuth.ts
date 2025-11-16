"use client";
import { create } from "zustand";
import { fetchJSON } from "@/utils/api";

interface User {
  id: string;
  name: string;
  email: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  csrfToken: string | null;
  lastError: string | null;
  shouldPromptLogin: boolean;
  fetchCsrf: () => Promise<void>;
  login: (email: string, password: string, remember?: boolean) => Promise<boolean>;
  register: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
  ackPromptLogin: () => void;
}

export const useAuth = create<AuthState>((set, get) => ({
  user: null,
  isAuthenticated: false,
  csrfToken: null,
  lastError: null,
  shouldPromptLogin: false,
  
  fetchCsrf: async () => {
    const res = await fetchJSON<{ ok: boolean; token: string }>("/api/auth/csrf");
    set({ csrfToken: res.token });
  },

  login: async (email: string, password: string, remember = false) => {
    try {
      set({ lastError: null });
      if (!get().csrfToken) await get().fetchCsrf();
      const res = await fetchJSON<{ ok: boolean; user?: User; error?: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password, remember }),
        headers: { "x-csrf-token": get().csrfToken || "" },
      });
      if (res.ok && res.user) {
        set({ user: res.user, isAuthenticated: true, lastError: null });
        return true;
      }
      set({ lastError: res.error || "登入失敗" });
      return false;
    } catch (error: any) {
      set({ lastError: String(error?.message || error) });
      return false;
    }
  },

  register: async (name: string, email: string, password: string) => {
    try {
      set({ lastError: null });
      if (!get().csrfToken) await get().fetchCsrf();
      const res = await fetchJSON<{ ok: boolean; user?: User; error?: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
        headers: { "x-csrf-token": get().csrfToken || "" },
      });
      if (res.ok && res.user) {
        set({ user: res.user, isAuthenticated: true, lastError: null });
        return true;
      }
      set({ lastError: res.error || "註冊失敗" });
      return false;
    } catch (error: any) {
      set({ lastError: String(error?.message || error) });
      return false;
    }
  },

  logout: async () => {
    try {
      if (!get().csrfToken) await get().fetchCsrf();
      await fetchJSON<{ ok: boolean }>("/api/auth/logout", {
        method: "POST",
        headers: { "x-csrf-token": get().csrfToken || "" },
      });
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  refreshMe: async () => {
    try {
      const res = await fetch("/api/auth/me", { headers: { "content-type": "application/json" }, credentials: "include" });
      if (res.status === 401) {
        set({ user: null, isAuthenticated: false, shouldPromptLogin: true });
        return;
      }
      if (!res.ok) return;
      const data = await res.json();
      if (data.ok && data.user) set({ user: data.user, isAuthenticated: true });
    } catch {}
  },

  ackPromptLogin: () => set({ shouldPromptLogin: false })
}));