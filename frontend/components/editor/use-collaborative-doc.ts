"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { toast } from "sonner";
import { WS_URL } from "@/lib/api-client";
import { idb } from "@/lib/db";
import { SyncProvider, type ConnStatus, type PresenceUser } from "@/lib/yjs-provider";
import type { SessionUser } from "@/lib/types";

interface CollaborativeDocOptions {
  docId: string;
  user: SessionUser | null;
  token: string | null;
  readOnly: boolean;
}

export interface CollaborativeDoc {
  status: ConnStatus;
  statusDetail: string | undefined;
  presence: PresenceUser[];
  text: string;
  lastActivity: Date | null;
  onChange: (value: string) => void;
  /** Re-run the Yjs handshake to pull missing server state. */
  requestSync: () => boolean;
}

/**
 * Owns the Yjs document lifecycle for one editor session: offline restore,
 * WebSocket provider, presence, and local edit forwarding. Server metadata
 * (title, permission) stays in React Query at the page level.
 */
export function useCollaborativeDoc({ docId, user, token, readOnly }: CollaborativeDocOptions): CollaborativeDoc {
  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [text, setText] = useState("");
  const [lastActivity, setLastActivity] = useState<Date | null>(null);

  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const providerRef = useRef<SyncProvider | null>(null);
  const applyingRemote = useRef(false);

  useEffect(() => {
    if (!user || !token || !docId) return;
    let cancelled = false;
    let ydoc: Y.Doc | null = null;
    let provider: SyncProvider | null = null;

    (async () => {
      ydoc = new Y.Doc();
      // Restore offline snapshot first (origin "indexeddb" — not echoed).
      try {
        const cached = await idb.loadYState(docId);
        if (cached && cached.length > 0 && !cancelled) {
          Y.applyUpdate(ydoc!, cached, "indexeddb");
        }
      } catch {
        /* start empty */
      }
      if (cancelled) {
        ydoc!.destroy();
        return;
      }

      const ytext = ydoc!.getText("content");
      ydocRef.current = ydoc!;
      ytextRef.current = ytext;
      setText(ytext.toString());

      const observer = () => {
        if (cancelled) return;
        applyingRemote.current = true;
        setText(ytext.toString());
        setLastActivity(new Date());
        // Release after React commits so the local onChange echo is ignored.
        requestAnimationFrame(() => {
          applyingRemote.current = false;
        });
      };
      ytext.observe(observer);

      provider = new SyncProvider(ydoc!, {
        docId,
        token,
        displayName: user.displayName,
        userId: user.id,
        wsUrl: WS_URL,
        onStatus: (s, detail) => {
          setStatus(s);
          setStatusDetail(detail);
          if (s === "unauthorized") toast.error(detail ?? "Session expired. Please log in again.");
          if (s === "denied") toast.error(detail ?? "Access denied.");
        },
        onAwareness: (users) => setPresence(users.filter((u) => u.userId !== user.id)),
      });
      providerRef.current = provider;
      provider.connect();

      const onOffline = () => {
        setStatus("offline");
        setStatusDetail("You are offline. Changes are saved locally.");
      };
      const onOnline = () => setStatusDetail(undefined);
      window.addEventListener("offline", onOffline);
      window.addEventListener("online", onOnline);

      (provider as SyncProvider & { cleanup?: () => void }).cleanup = () => {
        window.removeEventListener("offline", onOffline);
        window.removeEventListener("online", onOnline);
        ytext.unobserve(observer);
      };
    })();

    return () => {
      cancelled = true;
      const p = providerRef.current as (SyncProvider & { cleanup?: () => void }) | null;
      p?.cleanup?.();
      providerRef.current?.destroy();
      providerRef.current = null;
      ydocRef.current?.destroy();
      ydocRef.current = null;
      ytextRef.current = null;
    };
  }, [docId, token, user]);

  const onChange = useCallback(
    (value: string) => {
      if (applyingRemote.current) return;
      setText(value);
      setLastActivity(new Date());
      const ytext = ytextRef.current;
      const ydoc = ydocRef.current;
      if (!ytext || !ydoc || readOnly) return;
      ydoc.transact(() => {
        ytext.delete(0, ytext.length);
        if (value.length > 0) ytext.insert(0, value);
      }, "local");
    },
    [readOnly]
  );

  const requestSync = useCallback(() => providerRef.current?.requestSync() ?? false, []);

  return { status, statusDetail, presence, text, lastActivity, onChange, requestSync };
}
