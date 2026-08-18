import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq, sql } from "drizzle-orm";
import { config } from "../config/env.js";
import { snapshotLogger } from "../utils/logger.js";
import { documentSnapshots, documentDeltas, type DeltaInsert } from "./schema.js";

// ─── Drizzle DB Instance ─────────────────────────────────────────
const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30_000,
});

pool.on("error", (err) => {
    snapshotLogger.error({ err }, "PostgreSQL pool error");
});

const db: NodePgDatabase = drizzle(pool);

/**
 * Write a document snapshot to PostgreSQL using an atomic transaction.
 * Derives the next version from the current max + 1.
 */
export async function writeSnapshot(
    documentId: string,
    snapshotData: Buffer
): Promise<number> {
    return db.transaction(async (tx) => {
        // Get the current max version for this document
        const [versionRow] = await tx
            .select({
                maxVersion: sql<number>`COALESCE(MAX(${documentSnapshots.snapshotVersion}), 0)`,
            })
            .from(documentSnapshots)
            .where(eq(documentSnapshots.documentId, documentId));

        const nextVersion = (versionRow?.maxVersion ?? 0) + 1;

        // Insert the new snapshot
        await tx.insert(documentSnapshots).values({
            documentId,
            snapshotData: Buffer.isBuffer(snapshotData) ? snapshotData : Buffer.from(snapshotData),
            snapshotVersion: nextVersion,
        });

        snapshotLogger.info(
            { documentId, version: nextVersion, sizeBytes: snapshotData.length },
            "Snapshot written to DB"
        );

        return nextVersion;
    });
}

/**
 * Write a batch of deltas to the audit trail table.
 */
export async function writeDeltaAudit(
    entries: Array<{ documentId: string; deltaData: Buffer; userId: string }>
): Promise<void> {
    if (entries.length === 0) return;

    const rows: DeltaInsert[] = entries.map((e) => ({
        documentId: e.documentId,
        deltaData: Buffer.isBuffer(e.deltaData) ? e.deltaData : Buffer.from(e.deltaData),
        userId: e.userId,
    }));

    await db.transaction(async (tx) => {
        await tx.insert(documentDeltas).values(rows);
    });

    snapshotLogger.debug(
        { count: entries.length },
        "Delta audit entries written"
    );
}

/**
 * Load the latest snapshot for a document (used to reconstruct Y.Doc in persist-worker on startup).
 */
export async function loadLatestSnapshot(
    documentId: string
): Promise<Buffer | null> {
    const [row] = await db
        .select({ snapshotData: documentSnapshots.snapshotData })
        .from(documentSnapshots)
        .where(eq(documentSnapshots.documentId, documentId))
        .orderBy(desc(documentSnapshots.snapshotVersion))
        .limit(1);

    return row ? (row.snapshotData as unknown as Buffer) : null;
}

export async function closePool(): Promise<void> {
    await pool.end();
    snapshotLogger.info("PostgreSQL pool closed");
}
