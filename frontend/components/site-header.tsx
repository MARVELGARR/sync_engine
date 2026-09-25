"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "@/lib/auth-store";
import { Button } from "./ui/button";
import { Avatar } from "./ui/avatar";
import { Badge } from "./ui/badge";
import { ClaimAccountDialog } from "./claim-account-dialog";
import { Zap, LogOut, FileText, User as UserIcon, Sparkles } from "lucide-react";

export function SiteHeader() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();
  const [claimOpen, setClaimOpen] = useState(false);

  const isGuest = !!user?.isGuest;

  const onLogout = async () => {
    await logout();
    router.push("/login");
  };

  return (
    <header className="sticky top-0 z-40 border-b border-brand-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href={user ? "/documents" : "/"} className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand-600 text-white shadow-sm">
            <Zap className="size-4" />
          </span>
          <span className="text-base font-bold tracking-tight text-brand-950">
            Sync<span className="text-brand-600">Engine</span>
          </span>
        </Link>

        <nav className="flex items-center gap-2">
          {ready && user ? (
            <>
              <Link href="/documents">
                <Button variant="ghost" size="sm">
                  <FileText /> Documents
                </Button>
              </Link>
              {isGuest ? (
                <>
                  <Badge variant="warning">
                    Guest
                  </Badge>
                  <Button size="sm" onClick={() => setClaimOpen(true)}>
                    <Sparkles /> Create account
                  </Button>
                </>
              ) : (
                <Link href="/settings/profile">
                  <Button variant="ghost" size="sm">
                    <Avatar name={user.displayName} className="size-6 text-[10px]" />
                    <span className="max-w-28 truncate">{user.displayName}</span>
                  </Button>
                </Link>
              )}
              <Button variant="outline" size="sm" onClick={onLogout}>
                <LogOut /> Logout
              </Button>
              <ClaimAccountDialog open={claimOpen} onOpenChange={setClaimOpen} />
            </>
          ) : (
            <>
              <Link href="/login">
                <Button variant="ghost" size="sm">Log in</Button>
              </Link>
              <Link href="/register">
                <Button size="sm">
                  <UserIcon /> Sign up
                </Button>
              </Link>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
