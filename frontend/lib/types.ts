export type Permission = "read" | "read-write";

export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
  /** True for ephemeral guest sessions (upgrade via claim). */
  isGuest?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface AuthResponse {
  token: string;
  user: SessionUser;
}

export interface SyncDocument {
  id: string;
  title: string;
  ownerId: string;
  owner_id?: string;
  createdAt: string;
  updatedAt: string;
  created_at?: string;
  updated_at?: string;
  /** Derived client-side: true when current user owns the doc */
  isOwner?: boolean;
  /** Best-effort permission label (list endpoint does not return it) */
  permission?: Permission;
}

export interface SharePermission {
  id: string;
  documentId?: string;
  document_id?: string;
  userId?: string;
  user_id?: string;
  permission: Permission;
}

export interface AuthorizeResult {
  authorized: boolean;
  permission: Permission | null;
  userId: string;
  documentId: string;
}

export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message?: string;
}

export function normalizeDoc(raw: SyncDocument): SyncDocument {
  return {
    ...raw,
    ownerId: raw.ownerId ?? raw.owner_id ?? "",
    createdAt: raw.createdAt ?? raw.created_at ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? raw.updated_at ?? new Date().toISOString(),
  };
}
