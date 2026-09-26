"use client";

import { FolderOpen, Plus, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, Skeleton } from "@/components/ui/avatar";
import { ApiError } from "@/lib/api-client";
import type { SyncDocument } from "@/lib/types";
import type { DocumentsFilter } from "@/app/documents/searchParams";
import { DocumentCard } from "./document-card";

interface DocumentsGridProps {
  docs: SyncDocument[];
  isLoading: boolean;
  isError: boolean;
  error: unknown;
  onRetry: () => void;
  query: string;
  filter: DocumentsFilter;
  onCreate: () => void;
  onDelete: (id: string) => void;
}

export function DocumentsGrid({
  docs,
  isLoading,
  isError,
  error,
  onRetry,
  query,
  filter,
  onCreate,
  onDelete,
}: DocumentsGridProps) {
  if (isLoading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-32 w-full" />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive" className="flex items-center justify-between gap-4">
        <span className="flex items-center gap-2">
          <WifiOff className="size-4" />
          {error instanceof ApiError ? error.message : "Could not load documents."} Cached copies are shown when available.
        </span>
        <Button size="sm" variant="outline" onClick={onRetry}>Retry</Button>
      </Alert>
    );
  }

  if (docs.length === 0) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center gap-3 p-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-brand-100 text-brand-600">
            <FolderOpen className="size-6" />
          </span>
          <p className="font-semibold text-brand-950">
            {query ? "No documents match your search" : filter === "shared" ? "Nothing shared with you yet" : "No documents yet"}
          </p>
          <p className="max-w-sm text-sm text-slate-500">
            Create your first document to start real-time collaboration. It syncs instantly across every open tab.
          </p>
          {!query && filter !== "shared" && (
            <Button onClick={onCreate}>
              <Plus /> Create document
            </Button>
          )}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {docs.map((d) => (
        <DocumentCard key={d.id} doc={d} onDelete={onDelete} />
      ))}
    </div>
  );
}
