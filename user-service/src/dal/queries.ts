import { eq, and, or } from "drizzle-orm";
import { db } from "../config/db.js";
import {
    users,
    documents,
    documentPermissions,
    type UserInsert,
    type DocumentInsert,
    type PermissionInsert,
} from "./schema.js";

// ═══════════════════════════════════════════════════════════════
// USER QUERIES
// ═══════════════════════════════════════════════════════════════

export async function createUser(data: UserInsert) {
    const [user] = await db.insert(users).values(data).returning();
    return user;
}

export async function findUserByEmail(email: string) {
    const [user] = await db
        .select()
        .from(users)
        .where(eq(users.email, email))
        .limit(1);
    return user ?? null;
}

export async function findUserById(id: string) {
    const [user] = await db
        .select({
            id: users.id,
            email: users.email,
            displayName: users.displayName,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, id))
        .limit(1);
    return user ?? null;
}

// ═══════════════════════════════════════════════════════════════
// DOCUMENT QUERIES
// ═══════════════════════════════════════════════════════════════

export async function createDocument(data: DocumentInsert) {
    const [doc] = await db.insert(documents).values(data).returning();
    return doc;
}

export async function findDocumentById(id: string) {
    const [doc] = await db
        .select()
        .from(documents)
        .where(eq(documents.id, id))
        .limit(1);
    return doc ?? null;
}

export async function findDocumentsByUserId(userId: string) {
    // Documents the user owns OR has been granted permission to
    const ownedDocs = await db
        .select()
        .from(documents)
        .where(eq(documents.ownerId, userId));

    const sharedDocs = await db
        .select({
            id: documents.id,
            title: documents.title,
            ownerId: documents.ownerId,
            createdAt: documents.createdAt,
            updatedAt: documents.updatedAt,
        })
        .from(documents)
        .innerJoin(
            documentPermissions,
            eq(documents.id, documentPermissions.documentId)
        )
        .where(eq(documentPermissions.userId, userId));

    // Deduplicate by id (owner docs already have implicit access)
    const allDocs = [...ownedDocs];
    const ownedIds = new Set(ownedDocs.map((d) => d.id));
    for (const doc of sharedDocs) {
        if (!ownedIds.has(doc.id)) {
            allDocs.push(doc);
        }
    }
    return allDocs;
}

export async function deleteDocumentById(id: string, ownerId: string) {
    const [deleted] = await db
        .delete(documents)
        .where(and(eq(documents.id, id), eq(documents.ownerId, ownerId)))
        .returning();
    return deleted ?? null;
}

// ═══════════════════════════════════════════════════════════════
// PERMISSION QUERIES
// ═══════════════════════════════════════════════════════════════

export async function grantPermission(data: PermissionInsert) {
    const [perm] = await db
        .insert(documentPermissions)
        .values(data)
        .onConflictDoUpdate({
            target: [documentPermissions.documentId, documentPermissions.userId],
            set: { permission: data.permission },
        })
        .returning();
    return perm;
}

export async function revokePermission(documentId: string, userId: string) {
    const [revoked] = await db
        .delete(documentPermissions)
        .where(
            and(
                eq(documentPermissions.documentId, documentId),
                eq(documentPermissions.userId, userId)
            )
        )
        .returning();
    return revoked ?? null;
}

export async function findUserPermission(documentId: string, userId: string) {
    const [perm] = await db
        .select()
        .from(documentPermissions)
        .where(
            and(
                eq(documentPermissions.documentId, documentId),
                eq(documentPermissions.userId, userId)
            )
        )
        .limit(1);
    return perm ?? null;
}

export async function getDocumentPermissions(documentId: string) {
    return db
        .select({
            id: documentPermissions.id,
            userId: documentPermissions.userId,
            email: users.email,
            displayName: users.displayName,
            permission: documentPermissions.permission,
            grantedAt: documentPermissions.grantedAt,
        })
        .from(documentPermissions)
        .innerJoin(users, eq(documentPermissions.userId, users.id))
        .where(eq(documentPermissions.documentId, documentId));
}
