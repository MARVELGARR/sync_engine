// ─── User Types ─────────────────────────────────────────────────
export interface User {
    id: string;
    email: string;
    displayName: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface UserRegistrationPayload {
    email: string;
    password: string;
    displayName: string;
}

export interface UserLoginPayload {
    email: string;
    password: string;
}

// ─── JWT Types ──────────────────────────────────────────────────
export interface JWTPayload {
    sub: string;        // userId
    email: string;
    displayName: string;
    iat: number;
    exp: number;
}

// ─── Document Types ─────────────────────────────────────────────
export type PermissionLevel = "read" | "read-write";

export interface Document {
    id: string;
    title: string;
    ownerId: string;
    createdAt: Date;
    updatedAt: Date;
}

export interface DocumentPermission {
    id: string;
    documentId: string;
    userId: string;
    permission: PermissionLevel;
    grantedAt: Date;
}

export interface AuthorizeResponse {
    authorized: boolean;
    permission: PermissionLevel;
    userId: string;
    documentId: string;
}

// ─── CRDT / Sync Types ─────────────────────────────────────────
export interface CRDTDelta {
    docId: string;
    userId: string;
    delta: string;       // base64-encoded Yjs binary update
    timestamp: number;
    nodeId: string;       // originating sync-service node
}

// ─── Document Snapshot ──────────────────────────────────────────
export interface DocumentSnapshot {
    id: string;
    documentId: string;
    snapshotData: Buffer;
    snapshotVersion: number;
    createdAt: Date;
}

// ─── API Response Wrappers ──────────────────────────────────────
export interface ApiResponse<T = unknown> {
    success: boolean;
    data?: T;
    error?: string;
    message?: string;
}
