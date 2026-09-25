"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ClaimAccountDialog } from "@/components/claim-account-dialog";
import { Sparkles } from "lucide-react";
import { Protected } from "@/components/protected";
import { SiteHeader } from "@/components/site-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Alert, Skeleton } from "@/components/ui/avatar";
import { useAuthStore } from "@/lib/auth-store";
import { ApiError } from "@/lib/api-client";
import { useCreateDocument, useDeleteDocument, useDocuments } from "@/lib/documents";
import {
  FileText,
  Plus,
  Search,
  Trash2,
  Loader2,
  FolderOpen,
  ArrowUpDown,
  WifiOff,
} from "lucide-react";

type Filter = "all" | "owned" | "shared";
type Sort = "updated" | "created" | "title";

export default function DocumentsPage() {
  const user = useAuthStore((s) => s.user);
  const { data, isLoading, isError, error, refetch } = useDocuments();
  const createDoc = useCreateDocument();
  const deleteDoc = useDeleteDocument();

  const [filter, setFilter] = useState<Filter>("all");
  const [sort, setSort] = useState<Sort>("updated");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [title, setTitle] = useState("");
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

  const onCreate = async () => {
    if (!title.trim()) return;
    try {
      const doc = await createDoc.mutateAsync(title.trim());
      toast.success(`“${doc.title}” created`);
      setTitle("");
      setCreateOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create document");
    }
  };

  const onDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteDoc.mutateAsync(deleteId);
      toast.success("Document deleted");
      setDeleteId(null);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete document");
    }
  };

  return (
    <Protected>
      <div className="workspace-bg min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-6xl px-4 py-8">
          {isGuest && (
            <Alert className="mb-4 flex flex-wrap items-center justify-between gap-3 border-amber-200 bg-amber-50">
              <span className="flex items-center gap-2 text-sm text-amber-900">
                <Sparkles className="size-4" />
                You&apos;re browsing as a guest — sessions expire after 7 days and sharing is disabled.
              </span>
              <Button size="sm" onClick={() => setClaimOpen(true)}>
                Create free account
              </Button>
            </Alert>
          )}
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

          <Card className="mb-4">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-300" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search documents…"
                  className="pl-9"
                />
              </div>
              <div className="flex items-center gap-2">
                {(["all", "owned", "shared"] as Filter[]).map((f) => (
                  <Button
                    key={f}
                    size="sm"
                    variant={filter === f ? "default" : "outline"}
                    onClick={() => setFilter(f)}
                    className="capitalize"
                  >
                    {f} {f === "all" ? `(${counts.all})` : f === "owned" ? `(${counts.owned})` : `(${counts.shared})`}
                  </Button>
                ))}
                <Button size="sm" variant="ghost" onClick={() => setSort(sort === "updated" ? "title" : sort === "title" ? "created" : "updated")}>
                  <ArrowUpDown /> {sort === "updated" ? "Recent" : sort === "title" ? "A–Z" : "Newest"}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading && (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          )}

          {isError && (
            <Alert variant="destructive" className="flex items-center justify-between gap-4">
              <span className="flex items-center gap-2">
                <WifiOff className="size-4" />
                {error instanceof ApiError ? error.message : "Could not load documents."} Cached copies are shown when available.
              </span>
              <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
            </Alert>
          )}

          {!isLoading && !isError && docs.length === 0 && (
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
                  <Button onClick={() => setCreateOpen(true)}>
                    <Plus /> Create document
                  </Button>
                )}
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {docs.map((d) => (
              <Card key={d.id} className="group transition-shadow hover:shadow-md hover:shadow-brand-100">
                <CardContent className="p-5">
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-brand-600 text-white">
                      <FileText className="size-5" />
                    </span>
                    {d.isOwner ? (
                      <Badge variant="secondary">Owner</Badge>
                    ) : (
                      <Badge variant="outline">Shared</Badge>
                    )}
                  </div>
                  <Link href={`/documents/${d.id}`} className="block">
                    <h3 className="truncate font-semibold text-brand-950 hover:text-brand-600">{d.title}</h3>
                  </Link>
                  <p className="mt-1 text-xs text-slate-400">
                    Updated {new Date(d.updatedAt).toLocaleString()}
                  </p>
                  <div className="mt-4 flex items-center gap-2">
                    <Link href={`/documents/${d.id}`} className="flex-1">
                      <Button size="sm" className="w-full">Open</Button>
                    </Link>
                    {d.isOwner && (
                      <Button size="sm" variant="outline" onClick={() => setDeleteId(d.id)} aria-label={`Delete ${d.title}`}>
                        <Trash2 className="text-red-500" />
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </main>

        <ClaimAccountDialog open={claimOpen} onOpenChange={setClaimOpen} />

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogHeader>
            <DialogTitle>New document</DialogTitle>
            <DialogDescription>Give it a title — you can share it after creating.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="doc-title">Title</Label>
              <Input
                id="doc-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Product launch notes"
                onKeyDown={(e) => e.key === "Enter" && onCreate()}
                autoFocus
              />
            </div>
            <Button className="w-full" onClick={onCreate} disabled={createDoc.isPending || !title.trim()}>
              {createDoc.isPending && <Loader2 className="animate-spin" />}
              Create document
            </Button>
          </div>
        </Dialog>

        <Dialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
          <DialogHeader>
            <DialogTitle>Delete document?</DialogTitle>
            <DialogDescription>
              This permanently removes the document for everyone it was shared with. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setDeleteId(null)}>Cancel</Button>
            <Button variant="destructive" className="flex-1" onClick={onDelete} disabled={deleteDoc.isPending}>
              {deleteDoc.isPending && <Loader2 className="animate-spin" />}
              Delete
            </Button>
          </div>
        </Dialog>
      </div>
    </Protected>
  );
}
