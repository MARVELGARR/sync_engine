import type { ApiEnvelope } from "./types";

export const API_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") ?? "http://localhost/api";

export const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL?.replace(/\/$/, "") ?? "ws://localhost/ws";

export class ApiError extends Error {
  status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

let tokenGetter: () => string | null = () => null;
let tokenSetter: (t: string | null) => void = () => {};
let logoutHandler: () => void = () => {};

export function bindAuthHooks(opts: {
  getToken: () => string | null;
  setToken: (t: string | null) => void;
  onLogout: () => void;
}) {
  tokenGetter = opts.getToken;
  tokenSetter = opts.setToken;
  logoutHandler = opts.onLogout;
}

async function parseError(res: Response): Promise<string> {
  try {
    const body = await res.json();
    if (typeof body?.message === "string") return body.message;
    if (typeof body?.error === "string") return body.error;
    if (Array.isArray(body?.errors) && body.errors.length > 0) {
      return String(body.errors[0]?.message ?? body.errors[0]);
    }
  } catch {
    /* fall through */
  }
  return `Request failed (${res.status})`;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const doFetch = async (token: string | null): Promise<Response> => {
    const headers = new Headers(init.headers);
    headers.set("Content-Type", "application/json");
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return fetch(`${API_URL}${path}`, { ...init, headers });
  };

  let res = await doFetch(tokenGetter());
  if (res.status === 401 && tokenGetter()) {
    // Try a single token refresh before giving up.
    try {
      const r = await fetch(`${API_URL}/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${tokenGetter()}`,
        },
      });
      if (r.ok) {
        const body = (await r.json()) as ApiEnvelope<{ token: string }>;
        const next = body?.data?.token;
        if (next) {
          tokenSetter(next);
          res = await doFetch(next);
        }
      }
    } catch {
      /* fall through to error handling */
    }
  }

  if (res.status === 401) {
    logoutHandler();
    throw new ApiError("Session expired. Please log in again.", 401);
  }
  if (!res.ok) throw new ApiError(await parseError(res), res.status);

  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === "object" && "data" in (body as Record<string, unknown>)) {
    return (body as ApiEnvelope<T>).data;
  }
  return body as T;
}

export const api = {
  get: <T>(path: string) => apiFetch<T>(path),
  post: <T>(path: string, payload?: unknown) =>
    apiFetch<T>(path, { method: "POST", body: payload === undefined ? undefined : JSON.stringify(payload) }),
  del: <T>(path: string) => apiFetch<T>(path, { method: "DELETE" }),
};
