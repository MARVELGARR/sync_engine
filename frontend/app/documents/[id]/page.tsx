"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { toast } from "sonner";
import { Protected } from "@/components/protected";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, Avatar, Skeleton } from "@/components/ui/avatar";
import { ConnBadge } from "@/components/editor-status";
import { ShareDialog } from "@/components/share-dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { WS_URL } from "@/lib/api-client";
import { idb } from "@/lib/db";
import { useAuthorize, useDocument } from "@/lib/documents";
import { SyncProvider, type ConnStatus, type PresenceUser } from "@/lib/yjs-provider";
import {
  ArrowLeft,
  Share2,
  Eye,
  Pencil,
  Users,
  Clock,
  CloudOff,
  Lock,
} from "lucide-react";

export default function EditorPage() {
  const params = useParams<{ id: string }>();
  const docId = params.id;
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const docQuery = useDocument(docId);
  const authQuery = useAuthorize(docId);

  const [status, setStatus] = useState<ConnStatus>("connecting");
  const [statusDetail, setStatusDetail] = useState<string | undefined>();
  const [presence, setPresence] = useState<PresenceUser[]>([]);
  const [text, setText] = useState("");
  const [lastActivity, setLastActivity] = useState<Date | null>(null);
  const [shareOpen, setShareOpen] = useState(false);

  const ydocRef = useRef<Y.Doc | null>(null);
  const ytextRef = useRef<Y.Text | null>(null);
  const providerRef = useRef<SyncProvider | null>(null);
  const applyingRemote = useRef(false);

  const permission = authQuery.data?.permission ?? null;
  const isOwner = !!user && !!docQuery.data && docQuery.data.ownerId === user.id;
  const readOnly = permission === "read";

  const words = useMemo(() => {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }, [text]);

  // ── Yjs lifecycle ──────────────────────────────────────────────
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

  // Expired token while editing -> back to login.
  useEffect(() => {
    if (status === "unauthorized") {
      const t = setTimeout(() => router.push("/login"), 1800);
      return () => clearTimeout(t);
    }
  }, [status, router]);

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

  const loading = docQuery.isLoading || authQuery.isLoading;
  const loadError = docQuery.error ?? authQuery.error;
  const denied =
    status === "denied" ||
    (authQuery.data && !authQuery.data.authorized) ||
    (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404));

  return (
    <Protected>
      <div className="workspace-bg flex min-h-screen flex-col">
        <SiteHeader />

        {/* Top bar */}
        <div className="border-b border-brand-100 bg-white">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
            <Link href="/documents">
              <Button variant="ghost" size="sm">
                <ArrowLeft /> Back
              </Button>
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-lg font-bold text-brand-950">
                {docQuery.data?.title ?? <Skeleton className="inline-block h-5 w-48 align-middle" />}
              </h1>
              <p className="font-mono text-[11px] text-slate-400">{docId}</p>
            </div>
            <div className="flex items-center gap-2">
              {permission && (
                <Badge variant={readOnly ? "warning" : "secondary"} className="gap-1">
                  {readOnly ? <Eye className="size-3" /> : <Pencil className="size-3" />}
                  {readOnly ? "Read only" : isOwner ? "Owner · write" : "Can edit"}
                </Badge>
              )}
              <ConnBadge status={status} />
              <div className="flex -space-x-2">
                {presence.slice(0, 5).map((p) => (
                  <Avatar key={p.clientId} name={p.name ?? "?"} className="size-7 text-[10px]" />
                ))}
              </div>
              {isOwner && (
                <Button size="sm" onClick={() => setShareOpen(true)}>
                  <Share2 /> Share
                </Button>
              )}
            </div>
          </div>
          {(statusDetail || readOnly) && (
            <div className="border-t border-brand-100 bg-brand-50 px-4 py-1.5">
              <p className="mx-auto flex max-w-6xl items-center gap-2 text-xs text-brand-800">
                {status === "offline" ? <CloudOff className="size-3.5" /> : <Clock className="size-3.5" />}
                {statusDetail ??
                  "You have read-only access — the editor is disabled, but you receive live updates."}
              </p>
            </div>
          )}
        </div>

        <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 lg:grid-cols-[1fr_280px]">
          {/* Canvas */}
          <Card className="flex min-h-[480px] flex-col overflow-hidden">
            {loading ? (
              <CardContent className="space-y-3 p-6">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
                <Skeleton className="h-40 w-full" />
              </CardContent>
            ) : denied ? (
              <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
                <span className="flex size-12 items-center justify-center rounded-2xl bg-red-100 text-red-600">
                  <Lock className="size-6" />
                </span>
                <p className="font-semibold text-brand-950">Access denied</p>
                <p className="max-w-sm text-sm text-slate-500">
                  You don&apos;t have access to this document. Ask the owner to share it with you.
                </p>
                <Link href="/documents">
                  <Button variant="outline">Back to documents</Button>
                </Link>
              </CardContent>
            ) : loadError ? (
              <CardContent className="p-6">
                <Alert variant="destructive">
                  {loadError instanceof ApiError ? loadError.message : "Could not load document."}
                </Alert>
                <Button className="mt-4" variant="outline" onClick={() => { docQuery.refetch(); authQuery.refetch(); }}>
                  Retry
                </Button>
              </CardContent>
            ) : (
              <>
                <div className="flex items-center justify-between border-b border-brand-100 px-5 py-2.5 text-xs text-slate-500">
                  <span>
                    {words} word{words === 1 ? "" : "s"} · {text.length} characters
                  </span>
                  <span>
                    {lastActivity ? `Active ${lastActivity.toLocaleTimeString()}` : "Waiting for edits…"}
                    {" · "}snapshots persist async
                  </span>
                </div>
                <Textarea
                  value={text}
                  disabled={readOnly}
                  onChange={(e) => onChange(e.target.value)}
                  placeholder={readOnly ? "Read-only preview — live updates appear here." : "Start writing… changes sync in real time."}
                  className="thin-scroll min-h-[440px] flex-1 resize-none rounded-none border-0 text-[15px] leading-7 shadow-none focus-visible:ring-0"
                />
              </>
            )}
          </Card>

          {/* Side panel */}
          <aside className="space-y-4">
            <Card>
              <CardContent className="space-y-3 p-5">
                <p className="flex items-center gap-2 text-sm font-semibold text-brand-950">
                  <Users className="size-4 text-brand-600" />
                  Collaborators ({presence.length + 1})
                </p>
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm">
                    <Avatar name={user?.displayName ?? "?"} className="size-7 text-[10px]" />
                    <span className="truncate font-medium text-brand-950">{user?.displayName} (you)</span>
                  </div>
                  {presence.map((p) => (
                    <div key={p.clientId} className="flex items-center gap-2 text-sm">
                      <span
                        className="size-2.5 rounded-full"
                        style={{ backgroundColor: p.color ?? "#2563eb" }}
                      />
                      <Avatar name={p.name ?? "?"} className="size-7 text-[10px]" />
                      <span className="truncate text-slate-600">{p.name}</span>
                    </div>
                  ))}
                  {presence.length === 0 && (
                    <p className="text-xs text-slate-400">No one else is here right now.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="space-y-2 p-5 text-xs text-slate-500">
                <p className="font-semibold text-brand-950">How sync works</p>
                <ul className="list-disc space-y-1 pl-4">
                  <li>Edits broadcast instantly to every connected tab.</li>
                  <li>Snapshots are written async (≤ 5s) — “Connected” means live, not yet persisted.</li>
                  <li>Offline edits are kept in IndexedDB and sync on reconnect.</li>
                </ul>
              </CardContent>
            </Card>

            {isOwner && (
              <Button variant="outline" className="w-full" onClick={() => setShareOpen(true)}>
                <Share2 /> Manage sharing
              </Button>
            )}
          </aside>
        </main>

        <ShareDialog docId={docId} open={shareOpen} onOpenChange={setShareOpen} />
      </div>
    </Protected>
  );
}
