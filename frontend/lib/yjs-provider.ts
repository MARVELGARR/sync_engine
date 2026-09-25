"use client";

/**
 * Minimal y-websocket-compatible provider for the sync-service protocol:
 *  - message 0: Yjs sync (SyncStep1/Step2/Update) via y-protocols/sync
 *  - message 1: awareness via y-protocols/awareness
 *  - URL: ws(s)://host/ws?docId=<uuid>&token=<jwt>
 *  - close codes 4000/4001/4003/4005/4006 mapped to UI states.
 */
import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { idb } from "./db";

export type ConnStatus =
  | "connecting"
  | "connected"
  | "reconnecting"
  | "offline"
  | "denied"
  | "unauthorized"
  | "limited";

export const MESSAGE_SYNC = 0;
export const MESSAGE_AWARENESS = 1;

export interface PresenceUser {
  clientId: number;
  userId?: string;
  name?: string;
  color?: string;
}

interface ProviderOptions {
  docId: string;
  token: string;
  displayName: string;
  userId: string;
  wsUrl: string;
  onStatus: (s: ConnStatus, detail?: string) => void;
  onAwareness: (users: PresenceUser[]) => void;
}

const MAX_BACKOFF = 15000;

export class SyncProvider {
  doc: Y.Doc;
  awareness: awarenessProtocol.Awareness;
  status: ConnStatus = "connecting";
  private ws: WebSocket | null = null;
  private opts: ProviderOptions;
  private closed = false;
  private retries = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private everConnected = false;

  constructor(doc: Y.Doc, opts: ProviderOptions) {
    this.doc = doc;
    this.opts = opts;
    this.awareness = new awarenessProtocol.Awareness(doc);
    this.awareness.setLocalStateField("user", {
      name: opts.displayName,
      color: colorFor(opts.userId || opts.displayName),
      userId: opts.userId,
    });

    this.doc.on("update", this.onDocUpdate);
    this.awareness.on("update", this.onAwarenessUpdate);
    this.awareness.on("change", this.emitPresence);
  }

  connect() {
    this.closed = false;
    this.openSocket();
  }

  /**
   * Re-run the Yjs sync handshake against the server to pull any state
   * this client is missing (e.g. snapshots flushed to the DB after we
   * connected, or a room that was empty when we joined). Safe to call any
   * time the socket is open — sync messages are idempotent merges.
   * Returns false when there is no open connection to sync over.
   */
  requestSync(): boolean {
    if (this.ws?.readyState !== WebSocket.OPEN) return false;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(enc, this.doc);
    this.ws.send(encoding.toUint8Array(enc));
    return true;
  }

  private openSocket() {
    if (this.closed) return;
    this.setStatus(this.retries === 0 ? "connecting" : "reconnecting");
    const url = `${this.opts.wsUrl}?docId=${encodeURIComponent(this.opts.docId)}&token=${encodeURIComponent(this.opts.token)}`;
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      this.scheduleRetry();
      return;
    }
    ws.binaryType = "arraybuffer";
    this.ws = ws;

    ws.onopen = () => {
      this.retries = 0;
      this.everConnected = true;
      this.setStatus("connected");
      // Initiate Yjs handshake
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeSyncStep1(enc, this.doc);
      ws.send(encoding.toUint8Array(enc));
      // Broadcast our awareness
      const aEnc = encoding.createEncoder();
      encoding.writeVarUint(aEnc, MESSAGE_AWARENESS);
      encoding.writeVarUint8Array(
        aEnc,
        awarenessProtocol.encodeAwarenessUpdate(this.awareness, [this.doc.clientID])
      );
      ws.send(encoding.toUint8Array(aEnc));
      this.startPing();
    };

    ws.onmessage = (ev) => {
      const data = new Uint8Array(ev.data as ArrayBuffer);
      const decoder = decoding.createDecoder(data);
      const type = decoding.readVarUint(decoder);
      if (type === MESSAGE_SYNC) {
        const enc = encoding.createEncoder();
        encoding.writeVarUint(enc, MESSAGE_SYNC);
        syncProtocol.readSyncMessage(decoder, enc, this.doc, ws);
        if (encoding.length(enc) > 1) ws.send(encoding.toUint8Array(enc));
      } else if (type === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(
          this.awareness,
          decoding.readVarUint8Array(decoder),
          this
        );
      }
    };

    ws.onerror = () => {
      // onclose will handle retry
    };

    ws.onclose = (ev) => {
      this.stopPing();
      if (this.closed) return;
      switch (ev.code) {
        case 4003:
          this.setStatus("denied", "You no longer have access to this document.");
          return;
        case 4001:
          this.setStatus("unauthorized", "Session expired. Please log in again.");
          return;
        case 4005:
        case 4006:
          this.setStatus("limited", ev.reason || "Too many connections. Retry shortly.");
          this.scheduleRetry();
          return;
        default:
          break;
      }
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this.setStatus("offline", "You are offline. Changes are saved locally.");
      }
      this.scheduleRetry();
    };
  }

  private onDocUpdate = (update: Uint8Array, origin: unknown) => {
    // Persist every change locally (IndexedDB) for offline support.
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      void idb.saveYState(this.opts.docId, Y.encodeStateAsUpdate(this.doc));
    }, 800);

    // Updates applied from the socket carry the socket as origin (see
    // y-protocols readSyncMessage) — those are echoes, don't re-send.
    // Anything else (local textarea edits, offline restores) is forwarded.
    if (origin === this.ws) return;
    if (this.ws?.readyState === WebSocket.OPEN) {
      const enc = encoding.createEncoder();
      encoding.writeVarUint(enc, MESSAGE_SYNC);
      syncProtocol.writeUpdate(enc, update);
      this.ws.send(encoding.toUint8Array(enc));
    }
  };

  private onAwarenessUpdate = ({
    added,
    updated,
    removed,
  }: {
    added: number[];
    updated: number[];
    removed: number[];
  }) => {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    const enc = encoding.createEncoder();
    encoding.writeVarUint(enc, MESSAGE_AWARENESS);
    encoding.writeVarUint8Array(
      enc,
      awarenessProtocol.encodeAwarenessUpdate(this.awareness, [...added, ...updated, ...removed])
    );
    this.ws.send(encoding.toUint8Array(enc));
  };

  private emitPresence = () => {
    const users: PresenceUser[] = [];
    this.awareness.getStates().forEach((state, clientId) => {
      const u = (state as { user?: { name?: string; color?: string; userId?: string } }).user;
      if (!u) return;
      users.push({ clientId, userId: u.userId, name: u.name, color: u.color });
    });
    this.opts.onAwareness(users);
  };

  private setStatus(s: ConnStatus, detail?: string) {
    this.status = s;
    this.opts.onStatus(s, detail);
  }

  private scheduleRetry() {
    if (this.closed) return;
    this.setStatus(this.status === "connected" ? "reconnecting" : this.status === "connecting" ? "connecting" : "reconnecting");
    const delay = Math.min(1000 * 2 ** this.retries, MAX_BACKOFF);
    this.retries += 1;
    setTimeout(() => {
      if (this.closed) return;
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        this.setStatus("offline", "You are offline. Changes are saved locally.");
        this.scheduleRetry();
        return;
      }
      this.openSocket();
    }, delay);
  }

  private startPing() {
    this.stopPing();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        try {
          (this.ws as WebSocket & { ping?: () => void }).ping?.();
        } catch {
          /* browsers auto-pong; noop */
        }
      }
    }, 30000);
  }

  private stopPing() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  destroy() {
    this.closed = true;
    this.stopPing();
    if (this.saveTimer) clearTimeout(this.saveTimer);
    // Flush final state to IndexedDB — but never poison the cache with an
    // empty doc when we never synced (e.g. joinee opened an empty room,
    // then left). Next open re-syncs from the server instead of restoring
    // our empty snapshot.
    const ytext = this.doc.getText("content");
    if (this.everConnected || ytext.length > 0) {
      void idb.saveYState(this.opts.docId, Y.encodeStateAsUpdate(this.doc));
    } else {
      void idb.clearYState(this.opts.docId);
    }
    try {
      awarenessProtocol.removeAwarenessStates(this.awareness, [this.doc.clientID], "local");
    } catch {
      /* noop */
    }
    this.awareness.destroy();
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      this.ws.close(1000, "leave");
    }
    this.ws = null;
  }
}

function colorFor(seed: string): string {
  const palette = ["#2563eb", "#0ea5e9", "#4f46e5", "#0284c7", "#1d4ed8", "#0891b2"];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return palette[h % palette.length];
}
