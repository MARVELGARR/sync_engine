import * as Y from "yjs";
import { config } from "../config/env.js";
import { persistLogger } from "../utils/logger.js";
import { writeSnapshot, writeDeltaAudit, loadLatestSnapshot } from "../db/snapshot.writer.js";

// ─── Per-Document Delta Buffer ──────────────────────────────────
interface DocumentBuffer {
    docId: string;
    yDoc: Y.Doc;
    pendingDeltas: number;
    lastFlushTime: number;
    auditEntries: Array<{ documentId: string; deltaData: Buffer; userId: string }>;
}

// In-memory buffers: one per active document
const buffers: Map<string, DocumentBuffer> = new Map();

/**
 * Get or create a buffer for a document.
 * On first access, loads the latest snapshot from DB to reconstruct the Y.Doc.
 */
async function getBuffer(docId: string): Promise<DocumentBuffer> {
    let buffer = buffers.get(docId);
    if (buffer) return buffer;

    // Create new buffer and load existing state
    const yDoc = new Y.Doc();

    const existingSnapshot = await loadLatestSnapshot(docId);
    if (existingSnapshot) {
        Y.applyUpdate(yDoc, new Uint8Array(existingSnapshot));
        persistLogger.info({ docId }, "Loaded existing snapshot into buffer");
    }

    buffer = {
        docId,
        yDoc,
        pendingDeltas: 0,
        lastFlushTime: Date.now(),
        auditEntries: [],
    };

    buffers.set(docId, buffer);
    return buffer;
}

/**
 * Apply a delta update to a document's buffer.
 * If flush thresholds are met, triggers a snapshot write.
 */
export async function applyDelta(
    docId: string,
    deltaBase64: string,
    userId: string
): Promise<void> {
    const buffer = await getBuffer(docId);

    try {
        // Decode and apply the delta
        const deltaBytes = Buffer.from(deltaBase64, "base64");
        Y.applyUpdate(buffer.yDoc, new Uint8Array(deltaBytes));

        buffer.pendingDeltas++;
        buffer.auditEntries.push({
            documentId: docId,
            deltaData: deltaBytes,
            userId,
        });

        persistLogger.debug(
            { docId, pendingDeltas: buffer.pendingDeltas },
            "Delta applied to buffer"
        );

        // Check if we should flush (operation threshold)
        if (buffer.pendingDeltas >= config.flushThreshold) {
            persistLogger.info(
                { docId, reason: "threshold", pendingDeltas: buffer.pendingDeltas },
                "Flush triggered by operation threshold"
            );
            await flushBuffer(docId);
        }
    } catch (err) {
        persistLogger.error(
            { err, docId },
            "Failed to apply delta — skipping (possible corruption)"
        );
        // Don't let a bad delta block the entire stream
    }
}

/**
 * Flush a document buffer: write snapshot + delta audit to PostgreSQL.
 */
export async function flushBuffer(docId: string): Promise<void> {
    const buffer = buffers.get(docId);
    if (!buffer || buffer.pendingDeltas === 0) return;

    try {
        // Encode the full Y.Doc state as a binary snapshot
        const snapshotData = Buffer.from(Y.encodeStateAsUpdate(buffer.yDoc));

        // Write snapshot to DB
        const version = await writeSnapshot(docId, snapshotData);

        // Write delta audit trail
        await writeDeltaAudit(buffer.auditEntries);

        persistLogger.info(
            {
                docId,
                version,
                flushedDeltas: buffer.pendingDeltas,
                snapshotSizeBytes: snapshotData.length,
            },
            "Buffer flushed successfully"
        );

        // Reset the buffer
        buffer.pendingDeltas = 0;
        buffer.lastFlushTime = Date.now();
        buffer.auditEntries = [];
    } catch (err) {
        persistLogger.error({ err, docId }, "Failed to flush buffer");
    }
}

/**
 * Periodic flush: checks all buffers and flushes any that have exceeded
 * the time-based threshold.
 */
export async function periodicFlush(): Promise<void> {
    const now = Date.now();

    for (const [docId, buffer] of buffers) {
        if (
            buffer.pendingDeltas > 0 &&
            now - buffer.lastFlushTime >= config.flushIntervalMs
        ) {
            persistLogger.info(
                { docId, reason: "timer", pendingDeltas: buffer.pendingDeltas },
                "Flush triggered by time interval"
            );
            await flushBuffer(docId);
        }
    }
}

/**
 * Flush ALL pending buffers immediately (used during graceful shutdown).
 */
export async function flushAllBuffers(): Promise<void> {
    persistLogger.info(
        { activeBuffers: buffers.size },
        "Flushing all pending buffers..."
    );

    for (const docId of buffers.keys()) {
        await flushBuffer(docId);
    }

    persistLogger.info("All buffers flushed");
}
