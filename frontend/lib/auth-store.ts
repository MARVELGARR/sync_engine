"use client";

import { create } from "zustand";
import { api, bindAuthHooks } from "./api-client";
import { idb, IDB_KEYS } from "./db";
import type { AuthResponse, SessionUser } from "./types";

interface AuthState {
  user: SessionUser | null;
  token: string | null;
  ready: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setSession: (token: string, user: SessionUser) => Promise<void>;
}

function persistToken(token: string | null) {
  try {
    if (token) localStorage.setItem("sync.token", token);
    else localStorage.removeItem("sync.token");
  } catch {
    /* private mode */
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  ready: false,
  hydrated: false,

  setSession: async (token, user) => {
    persistToken(token);
    await idb.set(IDB_KEYS.session, { token, user });
    set({ token, user, ready: true, hydrated: true });
  },

  login: async (email, password) => {
    const data = await api.post<AuthResponse>("/auth/login", { email, password });
    await get().setSession(data.token, data.user);
  },

  register: async (email, password, displayName) => {
    await api.post("/auth/register", { email, password, displayName });
    // Backend register does not return a token -> log in immediately.
    await get().login(email, password);
  },

  logout: async () => {
    persistToken(null);
    await idb.del(IDB_KEYS.session);
    set({ token: null, user: null, ready: true, hydrated: true });
  },

  bootstrap: async () => {
    if (get().hydrated) return;
    bindAuthHooks({
      getToken: () => useAuthStore.getState().token,
      setToken: (t) => {
        persistToken(t);
        useAuthStore.setState({ token: t });
        const { token: cur, user } = useAuthStore.getState();
        if (cur && user) void idb.set(IDB_KEYS.session, { token: cur, user });
      },
      onLogout: () => {
        void get().logout();
      },
    });

    let token: string | null = null;
    try {
      token = localStorage.getItem("sync.token");
    } catch {
      token = null;
    }
    let cached: { token: string; user: SessionUser } | null = null;
    try {
      cached = await idb.get<{ token: string; user: SessionUser }>(IDB_KEYS.session);
    } catch {
      cached = null;
    }
    const effective = token ?? cached?.token ?? null;

    if (!effective) {
      set({ ready: true, hydrated: true });
      return;
    }
    set({ token: effective });
    try {
      const me = await api.get<SessionUser>("/auth/me");
      const user = cached && token === cached.token ? cached.user : me;
      persistToken(effective);
      await idb.set(IDB_KEYS.session, { token: effective, user });
      set({ user, token: effective, ready: true, hydrated: true });
    } catch {
      // Offline: fall back to cached session so IndexedDB data stays reachable.
      if (cached?.user && cached.token === effective) {
        set({ user: cached.user, token: effective, ready: true, hydrated: true });
      } else {
        persistToken(null);
        await idb.del(IDB_KEYS.session);
        set({ user: null, token: null, ready: true, hydrated: true });
      }
    }
  },
}));
