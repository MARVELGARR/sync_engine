import { docLogger } from "../utils/logger.js";
import * as queries from "../dal/queries.js";
import { AppError } from "./auth.service.js";

// ─── Create Document ────────────────────────────────────────────
export async function createDocument(title: string, ownerId: string) {
    const doc = await queries.createDocument({ title, ownerId });
    docLogger.info({ docId: doc.id, ownerId }, "Document created");
    return doc;
}

// ─── Get Document ───────────────────────────────────────────────
export async function getDocument(docId: string, userId: string) {
    const doc = await queries.findDocumentById(docId);
    if (!doc) {
        throw new AppError("Document not found", 404);
    }

    // Check access: owner or has permission
    if (doc.ownerId !== userId) {
        const perm = await queries.findUserPermission(docId, userId);
        if (!perm) {
            throw new AppError("Access denied", 403);
        }
    }

    return doc;
}

// ─── List User Documents ────────────────────────────────────────
export async function listDocuments(userId: string) {
    return queries.findDocumentsByUserId(userId);
}

// ─── Delete Document ────────────────────────────────────────────
export async function deleteDocument(docId: string, ownerId: string) {
    const deleted = await queries.deleteDocumentById(docId, ownerId);
    if (!deleted) {
        throw new AppError("Document not found or you are not the owner", 404);
    }
    docLogger.info({ docId, ownerId }, "Document deleted");
    return deleted;
}

// ─── Share Document ─────────────────────────────────────────────
export async function shareDocument(
    docId: string,
    ownerId: string,
    targetEmail: string,
    permission: "read" | "read-write"
) {
    // Verify document exists and requester is owner
    const doc = await queries.findDocumentById(docId);
    if (!doc) {
        throw new AppError("Document not found", 404);
    }
    if (doc.ownerId !== ownerId) {
        throw new AppError("Only the document owner can share", 403);
    }

    // Find the target user by email
    const targetUser = await queries.findUserByEmail(targetEmail);
    if (!targetUser) {
        throw new AppError("User not found with that email", 404);
    }

    // Cannot share with yourself
    if (targetUser.id === ownerId) {
        throw new AppError("Cannot share a document with yourself", 400);
    }

    const perm = await queries.grantPermission({
        documentId: docId,
        userId: targetUser.id,
        permission,
    });

    docLogger.info(
        { docId, targetUserId: targetUser.id, permission },
        "Document shared"
    );

    return perm;
}

// ─── Revoke Permission ──────────────────────────────────────────
export async function revokeDocumentPermission(
    docId: string,
    ownerId: string,
    targetUserId: string
) {
    const doc = await queries.findDocumentById(docId);
    if (!doc) {
        throw new AppError("Document not found", 404);
    }
    if (doc.ownerId !== ownerId) {
        throw new AppError("Only the document owner can revoke access", 403);
    }

    const revoked = await queries.revokePermission(docId, targetUserId);
    if (!revoked) {
        throw new AppError("Permission not found", 404);
    }

    docLogger.info({ docId, targetUserId }, "Permission revoked");
    return revoked;
}

// ─── Authorize (Internal Endpoint for Sync Service) ─────────────
export async function authorizeDocumentAccess(
    docId: string,
    userId: string
) {
    const doc = await queries.findDocumentById(docId);
    if (!doc) {
        return { authorized: false, permission: null, userId, documentId: docId };
    }

    // Owner always has read-write access
    if (doc.ownerId === userId) {
        return {
            authorized: true,
            permission: "read-write" as const,
            userId,
            documentId: docId,
        };
    }

    // Check explicit permissions
    const perm = await queries.findUserPermission(docId, userId);
    if (!perm) {
        return { authorized: false, permission: null, userId, documentId: docId };
    }

    return {
        authorized: true,
        permission: perm.permission,
        userId,
        documentId: docId,
    };
}
