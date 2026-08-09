import { Pool } from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { desc, eq } from "drizzle-orm";
import { config } from "../config/env.js";
import { roomLogger } from "../utils/logger.js";
import { documentSnapshots } from "./schema.js";

// ─── Lazy Drizzle DB ────────────────────────────────────────────
let db: NodePgDatabase | null = null;
let pool: Pool | null = null;

function getDb(): NodePgDatabase {
    if (!db) {
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: 5,
            idleTimeoutMillis: 30_000,
        });
        pool.on("error", (err) => {
            roomLogger.error({ err }, "Snapshot DB pool error");
        });
        db = drizzle(pool);
    }
    return db;
}

/**
 * Load the latest snapshot for a document from PostgreSQL using Drizzle ORM.
 * Returns the raw binary Buffer (Yjs encoded state) or null if none exists.
 */
export async function loadLatestSnapshot(
    documentId: string
): Promise<Buffer | null> {
    try {
        const [row] = await getDb()
            .select({ snapshotData: documentSnapshots.snapshotData })
            .from(documentSnapshots)
            .where(eq(documentSnapshots.documentId, documentId))
            .orderBy(desc(documentSnapshots.snapshotVersion))
            .limit(1);

        if (!row) {
            roomLogger.debug(
                { documentId },
                "No existing snapshot found — starting fresh"
            );
            return null;
        }

        roomLogger.info({ documentId }, "Loaded latest snapshot from DB");
        // Drizzle returns bytea as Buffer in node-postgres
        return row.snapshotData as unknown as Buffer;
    } catch (err) {
        roomLogger.error({ err, documentId }, "Failed to load snapshot");
        return null;
    }
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
        pool = null;
        db = null;
    }
}
