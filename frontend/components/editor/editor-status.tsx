"use client";

import { Badge } from "@/components/ui/badge";
import type { ConnStatus } from "@/lib/yjs-provider";
import { Wifi, WifiOff, Loader2, ShieldAlert, Ban, Users } from "lucide-react";

const MAP: Record<ConnStatus, { label: string; variant: "default" | "secondary" | "outline" | "success" | "warning" | "destructive" }> = {
  connecting: { label: "Connecting", variant: "secondary" },
  connected: { label: "Connected", variant: "success" },
  reconnecting: { label: "Reconnecting", variant: "warning" },
  offline: { label: "Offline", variant: "outline" },
  denied: { label: "Access denied", variant: "destructive" },
  unauthorized: { label: "Session expired", variant: "destructive" },
  limited: { label: "Room full", variant: "warning" },
};

export function ConnBadge({ status }: { status: ConnStatus }) {
  const m = MAP[status];
  const Icon =
    status === "connected" ? Wifi
    : status === "connecting" || status === "reconnecting" ? Loader2
    : status === "denied" ? Ban
    : status === "unauthorized" ? ShieldAlert
    : status === "limited" ? Users
    : WifiOff;
  return (
    <Badge variant={m.variant} className="gap-1.5">
      <Icon className={`size-3 ${status === "connecting" || status === "reconnecting" ? "animate-spin" : ""}`} />
      {m.label}
    </Badge>
  );
}
