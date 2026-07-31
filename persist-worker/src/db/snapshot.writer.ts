import { Pool } from "pg";
import { config } from "../config/env.js";
import { snapshotLogger } from "../utils/logger.js";

const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 5,
    idleTimeoutMillis: 30000,
});

pool.on("error", (err) => {
    snapshotLogger.error({ err }, "PostgreSQL pool error");
});

/**
 * Write a document snapshot to PostgreSQL.
 * Uses an upsert-like approach: insert with the next version number.
 */
export async function writeSnapshot(
    documentId: string,
    snapshotData: Buffer
): Promise<number> {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        // Get the current max version for this document
        const versionResult = await client.query(
            `SELECT COALESCE(MAX(snapshot_version), 0) AS max_version
       FROM documents_schema.document_snapshots
       WHERE document_id = $1`,
            [documentId]
        );

        const nextVersion = (versionResult.rows[0].max_version as number) + 1;

        // Insert the new snapshot
        await client.query(
            `INSERT INTO documents_schema.document_snapshots
         (document_id, snapshot_data, snapshot_version)
       VALUES ($1, $2, $3)`,
            [documentId, snapshotData, nextVersion]
        );

        await client.query("COMMIT");

        snapshotLogger.info(
            { documentId, version: nextVersion, sizeBytes: snapshotData.length },
            "Snapshot written to DB"
        );

        return nextVersion;
    } catch (err) {
        await client.query("ROLLBACK");
        snapshotLogger.error({ err, documentId }, "Failed to write snapshot");
        throw err;
    } finally {
        client.release();
    }
}

/**
 * Write a batch of deltas to the audit trail table.
 */
export async function writeDeltaAudit(
    entries: Array<{ documentId: string; deltaData: Buffer; userId: string }>
): Promise<void> {
    if (entries.length === 0) return;

    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        for (const entry of entries) {
            await client.query(
                `INSERT INTO documents_schema.document_deltas
           (document_id, delta_data, user_id)
         VALUES ($1, $2, $3)`,
                [entry.documentId, entry.deltaData, entry.userId]
            );
        }

        await client.query("COMMIT");
        snapshotLogger.debug(
            { count: entries.length },
            "Delta audit entries written"
        );
    } catch (err) {
        await client.query("ROLLBACK");
        snapshotLogger.error({ err }, "Failed to write delta audit entries");
    } finally {
        client.release();
    }
}

/**
 * Load the latest snapshot for a document (used to reconstruct Y.Doc).
 */
export async function loadLatestSnapshot(
    documentId: string
): Promise<Buffer | null> {
    const result = await pool.query(
        `SELECT snapshot_data
     FROM documents_schema.document_snapshots
     WHERE document_id = $1
     ORDER BY snapshot_version DESC
     LIMIT 1`,
        [documentId]
    );

    return result.rows.length > 0 ? result.rows[0].snapshot_data : null;
}

export async function closePool(): Promise<void> {
    await pool.end();
    snapshotLogger.info("PostgreSQL pool closed");
}
