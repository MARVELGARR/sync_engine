"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api-client";
import { idb } from "@/lib/db";
import { normalizeDoc, type AuthorizeResult, type SharePermission, type SyncDocument } from "@/lib/types";
import { useAuthStore } from "@/stores/use-auth-store";

/**
 * React Query hooks for documents — sole owner of document server state.
 * Never copy these results into Zustand or useState; call the hook again
 * where needed (the cache makes it cheap).
 */
export const docKeys = {
  all: ["documents"] as const,
  list: () => [...docKeys.all, "list"] as const,
  detail: (id: string) => [...docKeys.all, "detail", id] as const,
  authorize: (id: string) => [...docKeys.all, "authorize", id] as const,
  /** Back-compat aliases for the previous key shape. */
  one: (id: string) => [...docKeys.all, "detail", id] as const,
  auth: (id: string) => [...docKeys.all, "authorize", id] as const,
};

export function useDocuments() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: docKeys.list(),
    enabled: !!user,
    queryFn: async (): Promise<SyncDocument[]> => {
      try {
        const docs = await api.get<SyncDocument[]>("/documents");
        const list = docs.map((d) => {
          const n = normalizeDoc(d);
          n.isOwner = user ? n.ownerId === user.id : false;
          return n;
        });
        await idb.cacheDocs(list);
        await idb.set("docs:list-meta", { updatedAt: Date.now() });
        return list;
      } catch (e) {
        // Offline: serve IndexedDB cache.
        const cached = await idb.getCachedDocs<SyncDocument>();
        if (cached && cached.length > 0) return cached;
        throw e;
      }
    },
  });
}

export function useDocument(id: string) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: docKeys.detail(id),
    enabled: !!user && !!id,
    queryFn: async (): Promise<SyncDocument> => {
      const raw = await api.get<SyncDocument>(`/documents/${id}`);
      const n = normalizeDoc(raw);
      n.isOwner = user ? n.ownerId === user.id : false;
      return n;
    },
  });
}

export function useAuthorize(id: string) {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: docKeys.authorize(id),
    enabled: !!user && !!id,
    queryFn: () => api.get<AuthorizeResult>(`/documents/${id}/authorize`),
  });
}

export function useCreateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (title: string) => api.post<SyncDocument>("/documents", { title }),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.del(`/documents/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: docKeys.all }),
  });
}

export function useShareDocument(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; permission: "read" | "read-write" }) =>
      api.post<SharePermission>(`/documents/${id}/share`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.all });
      qc.invalidateQueries({ queryKey: docKeys.detail(id) });
    },
  });
}

export function useRevokeShare(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.del(`/documents/${id}/share/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.all });
      qc.invalidateQueries({ queryKey: docKeys.detail(id) });
    },
  });
}
