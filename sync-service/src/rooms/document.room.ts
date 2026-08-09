import * as Y from "yjs";
import * as syncProtocol from "y-protocols/sync";
import * as awarenessProtocol from "y-protocols/awareness";
import * as encoding from "lib0/encoding";
import * as decoding from "lib0/decoding";
import { WebSocket } from "ws";

import { config } from "../config/env.js";
import { roomLogger } from "../utils/logger.js";
import { publishUpdate, subscribeToDocument, unsubscribeFromDocument } from "../redis/redis.manager.js";
import { loadLatestSnapshot } from "../db/snapshot.loader.js";

// ─── Message Types (Yjs Protocol) ──────────────────────────────
const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;

// ─── Client Metadata ───────────────────────────────────────────
export interface ClientInfo {
    ws: WebSocket;
    userId: string;
    displayName: string;
    permission: "read" | "read-write";
}

// ─── Document Room ──────────────────────────────────────────────
export class DocumentRoom {
    public readonly docId: string;
    public readonly yDoc: Y.Doc;
    public readonly awareness: awarenessProtocol.Awareness;
    public readonly clients: Map<WebSocket, ClientInfo> = new Map();
    private cleanupTimer: ReturnType<typeof setTimeout> | null = null;
    private destroyed = false;

    constructor(docId: string) {
        this.docId = docId;
        this.yDoc = new Y.Doc();
        this.awareness = new awarenessProtocol.Awareness(this.yDoc);

        // When the Y.Doc receives an update, broadcast to all local clients + Redis
        this.yDoc.on("update", (update: Uint8Array, origin: unknown) => {
            // If the origin is a WebSocket, it came from a local client.
            // Broadcast to other local clients and publish to Redis.
            if (origin instanceof WebSocket) {
                this.broadcastUpdate(update, origin);

                // Find the userId of the sender
                const clientInfo = this.clients.get(origin);
                const userId = clientInfo?.userId || "unknown";

                // Publish to Redis for cross-node sync + persist-worker
                publishUpdate(this.docId, userId, update).catch((err) => {
                    roomLogger.error({ err, docId: this.docId }, "Failed to publish update to Redis");
                });
            }
            // If origin is "redis", it's a cross-node update — just broadcast locally
            else if (origin === "redis") {
                this.broadcastUpdate(update, null);
            }
        });

        // Handle awareness changes
        this.awareness.on(
            "update",
            ({ added, updated, removed }: { added: number[]; updated: number[]; removed: number[] }) => {
                const changedClients = [...added, ...updated, ...removed];
                const encoder = encoding.createEncoder();
                encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
                encoding.writeVarUint8Array(
                    encoder,
                    awarenessProtocol.encodeAwarenessUpdate(this.awareness, changedClients)
                );
                const msg = encoding.toUint8Array(encoder);
                this.broadcastRaw(msg, null);
            }
        );

        roomLogger.info({ docId }, "Document room created");
    }

    /**
     * Initialize the room: load existing snapshot from DB, subscribe to Redis.
     */
    async initialize(): Promise<void> {
        // Load latest snapshot from PostgreSQL
        const snapshot = await loadLatestSnapshot(this.docId);
        if (snapshot) {
            Y.applyUpdate(this.yDoc, new Uint8Array(snapshot));
            roomLogger.info({ docId: this.docId }, "Applied snapshot to Y.Doc");
        }

        // Subscribe to Redis Pub/Sub for cross-node updates
        await subscribeToDocument(this.docId, (message: string) => {
            this.handleRedisMessage(message);
        });
    }

    /**
     * Add a client WebSocket to this room and sync them.
     */
    addClient(client: ClientInfo): void {
        // Cancel any pending cleanup
        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
            this.cleanupTimer = null;
        }

        this.clients.set(client.ws, client);

        roomLogger.info(
            { docId: this.docId, userId: client.userId, connections: this.clients.size },
            "Client joined room"
        );

        // Send the initial sync to the new client (SyncStep1)
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeSyncStep1(encoder, this.yDoc);
        this.sendToClient(client.ws, encoding.toUint8Array(encoder));

        // Send current awareness states to the new client
        const awarenessStates = this.awareness.getStates();
        if (awarenessStates.size > 0) {
            const awarenessEncoder = encoding.createEncoder();
            encoding.writeVarUint(awarenessEncoder, MESSAGE_AWARENESS);
            encoding.writeVarUint8Array(
                awarenessEncoder,
                awarenessProtocol.encodeAwarenessUpdate(
                    this.awareness,
                    Array.from(awarenessStates.keys())
                )
            );
            this.sendToClient(client.ws, encoding.toUint8Array(awarenessEncoder));
        }
    }

    /**
     * Handle an incoming WebSocket binary message from a client.
     */
    handleMessage(ws: WebSocket, data: Uint8Array): void {
        const clientInfo = this.clients.get(ws);
        if (!clientInfo) return;

        try {
            const decoder = decoding.createDecoder(data);
            const messageType = decoding.readVarUint(decoder);

            switch (messageType) {
                case MESSAGE_SYNC: {
                    // Peek the sync message type without consuming the original decoder
                    const peekDecoder = decoding.createDecoder(data);
                    decoding.readVarUint(peekDecoder); // consume MESSAGE_SYNC
                    const syncMessageType = decoding.readVarUint(peekDecoder);

                    if (clientInfo.permission === "read" && syncMessageType !== 0) {
                        roomLogger.warn(
                            { docId: this.docId, userId: clientInfo.userId, syncMessageType },
                            "Read-only user attempted to send a sync update - ignored"
                        );
                        break;
                    }

                    const encoder = encoding.createEncoder();
                    encoding.writeVarUint(encoder, MESSAGE_SYNC);

                    syncProtocol.readSyncMessage(
                        decoder,
                        encoder,
                        this.yDoc,
                        ws
                    );

                    // If the encoder has content (e.g., SyncStep2 response), send it back
                    if (encoding.length(encoder) > 1) {
                        this.sendToClient(ws, encoding.toUint8Array(encoder));
                    }
                    break;
                }

                case MESSAGE_AWARENESS: {
                    const update = decoding.readVarUint8Array(decoder);
                    awarenessProtocol.applyAwarenessUpdate(
                        this.awareness,
                        update,
                        ws
                    );
                    break;
                }

                default:
                    roomLogger.warn({ messageType, docId: this.docId }, "Unknown message type");
            }
        } catch (err) {
            roomLogger.error({ err, docId: this.docId }, "Error handling message");
        }
    }

    /**
     * Remove a client from the room.
     */
    removeClient(ws: WebSocket): void {
        const clientInfo = this.clients.get(ws);
        if (!clientInfo) return;

        this.clients.delete(ws);

        // Remove awareness state for this client
        awarenessProtocol.removeAwarenessStates(
            this.awareness,
            [this.yDoc.clientID],
            null
        );

        roomLogger.info(
            { docId: this.docId, userId: clientInfo.userId, connections: this.clients.size },
            "Client left room"
        );

        // Schedule cleanup if room is empty
        if (this.clients.size === 0) {
            this.scheduleCleanup();
        }
    }

    /**
     * Handle a message from Redis Pub/Sub (cross-node update).
     */
    private handleRedisMessage(message: string): void {
        try {
            const parsed = JSON.parse(message);

            // Skip updates that originated from this node (prevent echo loops)
            if (parsed.nodeId === config.nodeId) {
                return;
            }

            // Decode and apply the update
            const update = Buffer.from(parsed.delta, "base64");
            Y.applyUpdate(this.yDoc, new Uint8Array(update), "redis");

            roomLogger.debug(
                { docId: this.docId, fromNode: parsed.nodeId },
                "Applied cross-node update from Redis"
            );
        } catch (err) {
            roomLogger.error({ err, docId: this.docId }, "Error handling Redis message");
        }
    }

    /**
     * Broadcast a Y.Doc update to all connected clients except the sender.
     */
    private broadcastUpdate(update: Uint8Array, sender: WebSocket | null): void {
        const encoder = encoding.createEncoder();
        encoding.writeVarUint(encoder, MESSAGE_SYNC);
        syncProtocol.writeUpdate(encoder, update);
        const msg = encoding.toUint8Array(encoder);

        this.broadcastRaw(msg, sender);
    }

    /**
     * Send raw binary to all clients (optionally excluding one).
     */
    private broadcastRaw(data: Uint8Array, exclude: WebSocket | null): void {
        for (const [ws] of this.clients) {
            if (ws !== exclude && ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }

    /**
     * Send a message to a specific client.
     */
    private sendToClient(ws: WebSocket, data: Uint8Array): void {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(data);
        }
    }

    /**
     * Schedule room destruction after a delay (if it's still empty).
     */
    private scheduleCleanup(): void {
        this.cleanupTimer = setTimeout(async () => {
            if (this.clients.size === 0 && !this.destroyed) {
                await this.destroy();
            }
        }, config.roomCleanupDelayMs);

        roomLogger.debug(
            { docId: this.docId, delayMs: config.roomCleanupDelayMs },
            "Room cleanup scheduled"
        );
    }

    /**
     * Destroy the room: unsubscribe from Redis, clean up Y.Doc.
     */
    async destroy(): Promise<void> {
        if (this.destroyed) return;
        this.destroyed = true;

        if (this.cleanupTimer) {
            clearTimeout(this.cleanupTimer);
        }

        await unsubscribeFromDocument(this.docId);
        this.awareness.destroy();
        this.yDoc.destroy();

        // Remove from the global room registry
        rooms.delete(this.docId);

        roomLogger.info({ docId: this.docId }, "Document room destroyed");
    }
}

// ─── Global Room Registry ───────────────────────────────────────
export const rooms: Map<string, DocumentRoom> = new Map();

/**
 * Get count of active connections for a user across all rooms on this node.
 */
export function getUserConnectionCount(userId: string): number {
    let count = 0;
    for (const room of rooms.values()) {
        for (const client of room.clients.values()) {
            if (client.userId === userId) {
                count++;
            }
        }
    }
    return count;
}

/**
 * Get or create a document room.
 */
export async function getOrCreateRoom(docId: string): Promise<DocumentRoom> {
    let room = rooms.get(docId);
    if (room) return room;

    room = new DocumentRoom(docId);
    rooms.set(docId, room);
    await room.initialize();
    return room;
}

/**
 * Destroy all rooms (for graceful shutdown).
 */
export async function destroyAllRooms(): Promise<void> {
    const destroyPromises = Array.from(rooms.values()).map((room) => room.destroy());
    await Promise.all(destroyPromises);
    roomLogger.info("All document rooms destroyed");
}
