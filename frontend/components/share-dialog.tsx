"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Badge } from "./ui/badge";
import { ApiError } from "@/lib/api-client";
import { useRevokeShare, useShareDocument } from "@/lib/documents";
import { Loader2, Share2, Trash2 } from "lucide-react";

interface GrantedEntry {
  userId: string;
  email: string;
  permission: "read" | "read-write";
}

export function ShareDialog({
  docId,
  open,
  onOpenChange,
}: {
  docId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const share = useShareDocument(docId);
  const revoke = useRevokeShare(docId);
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"read" | "read-write">("read-write");
  const [granted, setGranted] = useState<GrantedEntry[]>([]);
  const [revokeId, setRevokeId] = useState("");

  const onShare = async () => {
    if (!email.trim()) return;
    try {
      const res = await share.mutateAsync({ email: email.trim(), permission });
      const userId = res.userId ?? res.user_id ?? "";
      if (userId) {
        setGranted((g) => {
          const rest = g.filter((x) => x.userId !== userId);
          return [...rest, { userId, email: email.trim(), permission }];
        });
      }
      toast.success(`Shared with ${email.trim()} (${permission})`);
      setEmail("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not share document");
    }
  };

  const onRevoke = async (userId: string) => {
    if (!userId.trim()) return;
    try {
      await revoke.mutateAsync(userId.trim());
      setGranted((g) => g.filter((x) => x.userId !== userId.trim()));
      setRevokeId("");
      toast.success("Access revoked");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not revoke access");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2">
          <Share2 className="size-4 text-brand-600" /> Share document
        </DialogTitle>
        <DialogDescription>
          Invite a registered user by email. <Badge variant="secondary">read</Badge> can view only,{" "}
          <Badge variant="secondary">read-write</Badge> can edit.
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="share-email">Email</Label>
          <Input
            id="share-email"
            type="email"
            placeholder="teammate@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <div className="space-y-2">
          <Label>Permission</Label>
          <div className="flex gap-2">
            {(["read", "read-write"] as const).map((p) => (
              <Button
                key={p}
                size="sm"
                variant={permission === p ? "default" : "outline"}
                onClick={() => setPermission(p)}
                type="button"
              >
                {p}
              </Button>
            ))}
          </div>
        </div>
        <Button className="w-full" onClick={onShare} disabled={share.isPending || !email.trim()}>
          {share.isPending && <Loader2 className="animate-spin" />}
          Share
        </Button>

        {granted.length > 0 && (
          <div className="space-y-2 rounded-lg border border-brand-100 bg-brand-50/50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-700">Shared this session</p>
            {granted.map((g) => (
              <div key={g.userId} className="flex items-center justify-between gap-2 text-sm">
                <span className="truncate text-brand-950">{g.email}</span>
                <span className="flex items-center gap-2">
                  <Badge variant="outline">{g.permission}</Badge>
                  <Button size="sm" variant="ghost" onClick={() => onRevoke(g.userId)} disabled={revoke.isPending} aria-label={`Revoke ${g.email}`}>
                    <Trash2 className="size-3.5 text-red-500" />
                  </Button>
                </span>
              </div>
            ))}
          </div>
        )}

        <div className="space-y-2 border-t border-brand-100 pt-3">
          <Label htmlFor="revoke-id">Revoke by user ID</Label>
          <div className="flex gap-2">
            <Input
              id="revoke-id"
              placeholder="user-uuid (from a previous share)"
              value={revokeId}
              onChange={(e) => setRevokeId(e.target.value)}
            />
            <Button variant="outline" onClick={() => onRevoke(revokeId)} disabled={revoke.isPending || !revokeId.trim()}>
              Revoke
            </Button>
          </div>
          <p className="text-xs text-slate-400">
            The API has no permission-list endpoint yet, so earlier shares can be revoked with the user ID returned when sharing.
          </p>
        </div>
      </div>
    </Dialog>
  );
}
