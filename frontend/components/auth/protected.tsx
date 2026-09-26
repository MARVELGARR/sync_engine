"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/stores/use-auth-store";
import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/avatar";

export function Protected({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const hydrated = useAuthStore((s) => s.hydrated);
  const router = useRouter();

  useEffect(() => {
    if (ready && hydrated && !user) router.replace("/login");
  }, [ready, hydrated, user, router]);

  if (!ready || !hydrated) {
    return (
      <div className="workspace-bg min-h-screen">
        <SiteHeader />
        <div className="mx-auto max-w-6xl space-y-3 px-4 py-10">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </div>
      </div>
    );
  }
  if (!user) return null;
  return <>{children}</>;
}
