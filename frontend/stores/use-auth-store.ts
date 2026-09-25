"use client";

import { create } from "zustand";
import { api, bindAuthHooks } from "@/lib/api-client";
import { idb, IDB_KEYS } from "@/lib/db";
import type { AuthResponse, SessionUser } from "@/lib/types";
import { getQueryClient } from "@/lib/query-client";

/**
 * Auth/session store — client-only JWT session.
 *
 * NOTE on frontend-web-stack conventions: the stack assigns auth/session
 * ownership to Better Auth. This backend uses a custom JWT user-service
 * (register/login/guest/claim + Bearer token + /auth/refresh), so there is
 * no Better Auth server instance to read from. This Zustand store is the
 * deliberate adaptation: it owns ONLY the token + current user (client-only
 * session), never server data like documents. Documents stay in React Query.
 */
interface AuthState {
  user: SessionUser | null;
  token: string | null;
  ready: boolean;
  hydrated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName: string) => Promise<void>;
  /** Mint an ephemeral guest session — no credentials needed. */
  loginAsGuest: (displayName?: string) => Promise<void>;
  /** Convert the current guest session into a full account. */
  claimGuest: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  bootstrap: () => Promise<void>;
  setSession: (token: string, user: SessionUser) => Promise<void>;
}

export const isGuestUser = (u: SessionUser | null): boolean => !!u?.isGuest;

function persistToken(token: string | null) {
  try {
    if (token) localStorage.setItem("sync.token", token);
    else localStorage.removeItem("sync.token");
  } catch {
    /* private mode */
  }
}

/** Drop user-scoped server data so a previous session never leaks. */
function clearUserCache() {
  try {
    const qc = getQueryClient();
    qc.removeQueries({ queryKey: ["documents"] });
    qc.removeQueries({ queryKey: ["current-user"] });
  } catch {
    /*QueryClient may not exist yet during bootstrap */
  }
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  token: null,
  ready: false,
  hydrated: false,

  setSession: async (token, user) => {
    clearUserCache();
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

  loginAsGuest: async (displayName) => {
    const data = await api.post<AuthResponse>(
      "/auth/guest",
      displayName?.trim() ? { displayName: displayName.trim() } : {}
    );
    await get().setSession(data.token, data.user);
  },

  claimGuest: async (email, password, displayName) => {
    const data = await api.post<AuthResponse>("/auth/claim", {
      email,
      password,
      ...(displayName?.trim() ? { displayName: displayName.trim() } : {}),
    });
    await get().setSession(data.token, data.user);
  },

  logout: async () => {
    persistToken(null);
    await idb.del(IDB_KEYS.session);
    clearUserCache();
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
        clearUserCache();
        set({ user: null, token: null, ready: true, hydrated: true });
      }
    }
  },
}));
