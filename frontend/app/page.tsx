"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth-store";

export default function Home() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const router = useRouter();

  useEffect(() => {
    if (!ready) return;
    router.replace(user ? "/documents" : "/login");
  }, [ready, user, router]);

  return (
    <div className="workspace-bg flex min-h-screen items-center justify-center">
      <div className="flex items-center gap-3 text-brand-700">
        <span className="size-3 animate-pulse rounded-full bg-brand-500" />
        <p className="text-sm font-medium">Loading SyncEngine…</p>
      </div>
    </div>
  );
}
