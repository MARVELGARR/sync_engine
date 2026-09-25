"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api-client";
import { idb } from "./db";
import { normalizeDoc, type AuthorizeResult, type SharePermission, type SyncDocument } from "./types";
import { useAuthStore } from "./auth-store";

export const docKeys = {
  all: ["documents"] as const,
  one: (id: string) => ["documents", id] as const,
  auth: (id: string) => ["documents", id, "authorize"] as const,
};

export function useDocuments() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: docKeys.all,
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
    queryKey: docKeys.one(id),
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
    queryKey: docKeys.auth(id),
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
      qc.invalidateQueries({ queryKey: docKeys.one(id) });
    },
  });
}

export function useRevokeShare(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: string) => api.del(`/documents/${id}/share/${userId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: docKeys.all });
      qc.invalidateQueries({ queryKey: docKeys.one(id) });
    },
  });
}
