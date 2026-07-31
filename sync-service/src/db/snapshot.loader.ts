import { Pool } from "pg";
import { config } from "../config/env.js";
import { roomLogger } from "../utils/logger.js";

let pool: Pool;

function getPool(): Pool {
    if (!pool) {
        pool = new Pool({
            connectionString: config.databaseUrl,
            max: 5,
            idleTimeoutMillis: 30000,
        });
        pool.on("error", (err) => {
            roomLogger.error({ err }, "Snapshot DB pool error");
        });
    }
    return pool;
}

/**
 * Load the latest snapshot for a document from PostgreSQL.
 * Returns the raw binary data (Yjs encoded state) or null if no snapshot exists.
 */
export async function loadLatestSnapshot(
    documentId: string
): Promise<Buffer | null> {
    const p = getPool();
    try {
        const result = await p.query(
            `SELECT snapshot_data
       FROM documents_schema.document_snapshots
       WHERE document_id = $1
       ORDER BY snapshot_version DESC
       LIMIT 1`,
            [documentId]
        );

        if (result.rows.length === 0) {
            roomLogger.debug({ documentId }, "No existing snapshot found — starting fresh");
            return null;
        }

        roomLogger.info({ documentId }, "Loaded latest snapshot from DB");
        return result.rows[0].snapshot_data;
    } catch (err) {
        roomLogger.error({ err, documentId }, "Failed to load snapshot");
        return null;
    }
}

export async function closePool(): Promise<void> {
    if (pool) {
        await pool.end();
    }
}
