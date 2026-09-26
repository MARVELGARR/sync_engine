"use client";

import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/avatar";

export function GuestBanner({ onUpgrade }: { onUpgrade: () => void }) {
  return (
    <Alert className="mb-4 flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50">
      <span className="flex items-center gap-2 text-sm text-amber-900">
        <Sparkles className="size-4" />
        You&apos;re browsing as a guest — sessions expire after 7 days and sharing is disabled.
      </span>
      <Button size="sm" onClick={onUpgrade}>
        Create free account
      </Button>
    </Alert>
  );
}
