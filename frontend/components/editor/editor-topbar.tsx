"use client";

import Link from "next/link";
import { ArrowLeft, Clock, CloudOff, Eye, Pencil, RefreshCw, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, Skeleton } from "@/components/ui/avatar";
import { ConnBadge } from "./editor-status";
import type { ConnStatus, PresenceUser } from "@/lib/yjs-provider";
import type { Permission } from "@/lib/types";

interface EditorTopbarProps {
  docId: string;
  title: string | undefined;
  permission: Permission | null;
  isOwner: boolean;
  readOnly: boolean;
  status: ConnStatus;
  statusDetail: string | undefined;
  presence: PresenceUser[];
  refreshing: boolean;
  loading: boolean;
  onRefresh: () => void;
  onShare: () => void;
}

export function EditorTopbar({
  docId,
  title,
  permission,
  isOwner,
  readOnly,
  status,
  statusDetail,
  presence,
  refreshing,
  loading,
  onRefresh,
  onShare,
}: EditorTopbarProps) {
  return (
    <div className="border-b border-brand-100 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
        <Link href="/documents">
          <Button variant="ghost" size="sm">
            <ArrowLeft /> Back
          </Button>
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold text-brand-950">
            {title ?? <Skeleton className="inline-block h-5 w-48 align-middle" />}
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
          <Button
            variant="ghost"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing || loading}
            title="Pull the latest content from the server"
          >
            <RefreshCw className={refreshing ? "animate-spin" : undefined} />
            Refresh
          </Button>
          <div className="flex -space-x-2">
            {presence.slice(0, 5).map((p) => (
              <Avatar key={p.clientId} name={p.name ?? "?"} className="size-7 text-[10px]" />
            ))}
          </div>
          {isOwner && (
            <Button size="sm" onClick={onShare}>
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
  );
}
