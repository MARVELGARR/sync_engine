"use client";

import Link from "next/link";
import { useMemo } from "react";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { ApiError } from "@/lib/api-client";

interface EditorCanvasProps {
  loading: boolean;
  denied: boolean;
  loadError: unknown;
  onRetry: () => void;
  text: string;
  lastActivity: Date | null;
  readOnly: boolean;
  onChange: (value: string) => void;
}

export function EditorCanvas({
  loading,
  denied,
  loadError,
  onRetry,
  text,
  lastActivity,
  readOnly,
  onChange,
}: EditorCanvasProps) {
  const words = useMemo(() => {
    const t = text.trim();
    return t ? t.split(/\s+/).length : 0;
  }, [text]);

  return (
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
          <Button className="mt-4" variant="outline" onClick={onRetry}>
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
  );
}
