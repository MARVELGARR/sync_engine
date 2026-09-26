"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Database, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, Separator } from "@/components/ui/avatar";
import { useAuthStore } from "@/stores/use-auth-store";

export function ProfileView() {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [clearing, setClearing] = useState(false);

  const onLogout = async () => {
    await logout();
    router.push("/login");
  };

  const clearCache = async () => {
    setClearing(true);
    try {
      // Drop cached docs + offline snapshots, keep the session.
      if (typeof indexedDB !== "undefined") {
        await new Promise<void>((resolve) => {
          const req = indexedDB.deleteDatabase("sync-engine");
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
          req.onblocked = () => resolve();
        });
      }
      toast.success("Local cache cleared");
    } catch {
      toast.error("Could not clear cache");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile</CardTitle>
        <CardDescription>Your identity and local workspace settings.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center gap-4">
          <Avatar name={user?.displayName ?? "?"} className="size-14 text-lg" />
          <div>
            <p className="text-lg font-semibold text-brand-950">{user?.displayName}</p>
            <p className="text-sm text-slate-500">{user?.email}</p>
          </div>
        </div>
        <Separator />
        <div className="grid gap-2 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">User ID</span>
            <code className="rounded bg-brand-50 px-2 py-0.5 font-mono text-xs text-brand-800">{user?.id}</code>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Member since</span>
            <span className="text-brand-950">{user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Offline storage</span>
            <span className="text-brand-950">IndexedDB (session, doc cache, snapshots)</span>
          </div>
        </div>
        <Separator />
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={clearCache} disabled={clearing} className="flex-1">
            <Database /> {clearing ? "Clearing…" : "Clear local cache"}
          </Button>
          <Button variant="destructive" onClick={onLogout} className="flex-1">
            <LogOut /> Log out
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
