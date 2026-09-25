import {
    pgSchema,
    uuid,
    varchar,
    timestamp,
    pgEnum,
    uniqueIndex,
    boolean,
    integer,
} from "drizzle-orm/pg-core";

// ─── Schema ─────────────────────────────────────────────────────
export const usersSchema = pgSchema("users_schema");

// ─── Enums ──────────────────────────────────────────────────────
export const permissionLevelEnum = pgEnum("permission_level", [
    "read",
    "read-write",
]);

// ─── Users Table ────────────────────────────────────────────────
export const users = usersSchema.table("users", {
    id: uuid("id").primaryKey().defaultRandom(),
    email: varchar("email", { length: 255 }).unique().notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    displayName: varchar("display_name", { length: 100 }).notNull(),
    // ── Hardened auth + guest mode ──
    // isGuest marks ephemeral guest accounts (auto-expiring, convertible).
    isGuest: boolean("is_guest").notNull().default(false),
    // Null for full accounts; expiry timestamp for guests.
    guestExpiresAt: timestamp("guest_expires_at", { withTimezone: true }),
    // Bumped whenever credentials change (password set, guest claimed)
    // so previously issued JWTs can be rejected via the `tv` claim.
    tokenVersion: integer("token_version").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Documents Table ────────────────────────────────────────────
export const documents = usersSchema.table("documents", {
    id: uuid("id").primaryKey().defaultRandom(),
    title: varchar("title", { length: 255 }).notNull(),
    ownerId: uuid("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// ─── Document Permissions Table ─────────────────────────────────
export const documentPermissions = usersSchema.table(
    "document_permissions",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        documentId: uuid("document_id")
            .notNull()
            .references(() => documents.id, { onDelete: "cascade" }),
        userId: uuid("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        permission: permissionLevelEnum("permission").notNull().default("read"),
        grantedAt: timestamp("granted_at", { withTimezone: true }).defaultNow(),
    },
    (table) => ({
        uniqueDocUser: uniqueIndex("unique_doc_user").on(
            table.documentId,
            table.userId
        ),
    })
);

// ─── Type Exports ───────────────────────────────────────────────
export type UserInsert = typeof users.$inferInsert;
export type UserSelect = typeof users.$inferSelect;
export type DocumentInsert = typeof documents.$inferInsert;
export type DocumentSelect = typeof documents.$inferSelect;
export type PermissionInsert = typeof documentPermissions.$inferInsert;
export type PermissionSelect = typeof documentPermissions.$inferSelect;
