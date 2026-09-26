"use client";

import { Share2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import type { PresenceUser } from "@/lib/yjs-provider";

interface CollaboratorsPanelProps {
  presence: PresenceUser[];
  currentUserName: string | undefined;
  isOwner: boolean;
  onShare: () => void;
}

export function CollaboratorsPanel({ presence, currentUserName, isOwner, onShare }: CollaboratorsPanelProps) {
  return (
    <aside className="space-y-4">
      <Card>
        <CardContent className="space-y-3 p-5">
          <p className="flex items-center gap-2 text-sm font-semibold text-brand-950">
            <Users className="size-4 text-brand-600" />
            Collaborators ({presence.length + 1})
          </p>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-sm">
              <Avatar name={currentUserName ?? "?"} className="size-7 text-[10px]" />
              <span className="truncate font-medium text-brand-950">{currentUserName} (you)</span>
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
            <li>Opened a shared doc and it looks empty? Hit Refresh to pull the latest saved content.</li>
          </ul>
        </CardContent>
      </Card>

      {isOwner && (
        <Button variant="outline" className="w-full" onClick={onShare}>
          <Share2 /> Manage sharing
        </Button>
      )}
    </aside>
  );
}
