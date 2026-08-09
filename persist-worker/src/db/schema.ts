import {
    pgSchema,
    uuid,
    bytea,
    integer,
    timestamp,
    uniqueIndex,
} from "drizzle-orm/pg-core";

// ─── Schema ─────────────────────────────────────────────────────
export const documentsSchema = pgSchema("documents_schema");

// ─── Document Snapshots ─────────────────────────────────────────
export const documentSnapshots = documentsSchema.table(
    "document_snapshots",
    {
        id: uuid("id").primaryKey().defaultRandom(),
        documentId: uuid("document_id").notNull(),
        snapshotData: bytea("snapshot_data").notNull(),
        snapshotVersion: integer("snapshot_version").notNull(),
        createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    },
    (table) => ({
        uniqueDocVersion: uniqueIndex("unique_doc_version").on(
            table.documentId,
            table.snapshotVersion
        ),
    })
);

// ─── Document Deltas (Audit Trail) ──────────────────────────────
export const documentDeltas = documentsSchema.table("document_deltas", {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id").notNull(),
    deltaData: bytea("delta_data").notNull(),
    userId: uuid("user_id"),
    appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow(),
});

// ─── Type Exports ───────────────────────────────────────────────
export type SnapshotInsert = typeof documentSnapshots.$inferInsert;
export type SnapshotSelect = typeof documentSnapshots.$inferSelect;
export type DeltaInsert = typeof documentDeltas.$inferInsert;
export type DeltaSelect = typeof documentDeltas.$inferSelect;
