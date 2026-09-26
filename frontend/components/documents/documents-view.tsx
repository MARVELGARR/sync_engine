"use client";

import { useMemo, useState } from "react";
import { useQueryStates } from "nuqs";
import { Plus } from "lucide-react";
import { documentsSearchParams, type DocumentsFilter, type DocumentsSort } from "@/app/documents/searchParams";
import { ClaimAccountDialog } from "@/components/auth/claim-account-dialog";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/use-auth-store";
import { useDocuments } from "@/hooks/queries/use-documents";
import { GuestBanner } from "./guest-banner";
import { DocumentsToolbar } from "./documents-toolbar";
import { DocumentsGrid } from "./documents-grid";
import { CreateDocumentDialog } from "./create-document-dialog";
import { DeleteDocumentDialog } from "./delete-document-dialog";

/**
 * Document workspace home: list owned/shared docs with URL-driven
 * filter/sort/search (nuqs), plus create/delete dialogs.
 */
export function DocumentsView() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error, refetch } = useDocuments();

  // URL-owned workspace state (nuqs): shareable, survives refresh, drives
  // back/forward. Local useState is only for ephemeral dialogs below.
  const [{ q: query, filter, sort }, setParams] = useQueryStates(documentsSearchParams, {
    history: "push",
  });
  const setQuery = (v: string) => void setParams({ q: v === "" ? null : v });
  const setFilter = (v: DocumentsFilter) => void setParams({ filter: v === "all" ? null : v });
  const setSort = (v: DocumentsSort) => void setParams({ sort: v === "updated" ? null : v });

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [claimOpen, setClaimOpen] = useState(false);
  const isGuest = !!user?.isGuest;

  const docs = useMemo(() => {
    const list = data ?? [];
    let out = list.map((d) => ({ ...d, isOwner: user ? d.ownerId === user.id : false }));
    if (filter === "owned") out = out.filter((d) => d.isOwner);
    if (filter === "shared") out = out.filter((d) => !d.isOwner);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((d) => d.title.toLowerCase().includes(q));
    }
    out = [...out].sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "created") return +new Date(b.createdAt) - +new Date(a.createdAt);
      return +new Date(b.updatedAt) - +new Date(a.updatedAt);
    });
    return out;
  }, [data, filter, sort, query, user]);

  const counts = useMemo(() => {
    const list = data ?? [];
    const owned = list.filter((d) => user && d.ownerId === user.id).length;
    return { all: list.length, owned, shared: list.length - owned };
  }, [data, user]);

  return (
    <>
      {isGuest && <GuestBanner onUpgrade={() => setClaimOpen(true)} />}

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-brand-950">Documents</h1>
          <p className="text-sm text-slate-500">
            {counts.all} total · {counts.owned} owned · {counts.shared} shared with you
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus /> New document
        </Button>
      </div>

      <DocumentsToolbar
        query={query}
        onQueryChange={setQuery}
        filter={filter}
        onFilterChange={setFilter}
        sort={sort}
        onSortChange={setSort}
        counts={counts}
      />

      <DocumentsGrid
        docs={docs}
        isLoading={isLoading}
        isError={isError}
        error={error}
        onRetry={() => refetch()}
        query={query}
        filter={filter}
        onCreate={() => setCreateOpen(true)}
        onDelete={setDeleteId}
      />

      <ClaimAccountDialog open={claimOpen} onOpenChange={setClaimOpen} />
      <CreateDocumentDialog open={createOpen} onOpenChange={setCreateOpen} />
      <DeleteDocumentDialog docId={deleteId} onClose={() => setDeleteId(null)} />
    </>
  );
}
