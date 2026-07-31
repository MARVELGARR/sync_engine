import Redis from "ioredis";
import { config } from "../config/env.js";
import { redisLogger } from "../utils/logger.js";

// Two separate Redis clients are required:
// 1. `pub` — for publishing messages and writing to streams
// 2. `sub` — for subscribing to Pub/Sub channels (a subscribed client cannot run other commands)

let pub: Redis;
let sub: Redis;

export function getPublisher(): Redis {
    if (!pub) {
        pub = new Redis(config.redisUrl, { lazyConnect: true });
        pub.on("error", (err) => redisLogger.error({ err }, "Redis publisher error"));
        pub.on("connect", () => redisLogger.info("Redis publisher connected"));
    }
    return pub;
}

export function getSubscriber(): Redis {
    if (!sub) {
        sub = new Redis(config.redisUrl, { lazyConnect: true });
        sub.on("error", (err) => redisLogger.error({ err }, "Redis subscriber error"));
        sub.on("connect", () => redisLogger.info("Redis subscriber connected"));
    }
    return sub;
}

export async function connectRedis(): Promise<void> {
    const publisher = getPublisher();
    const subscriber = getSubscriber();

    await Promise.all([publisher.connect(), subscriber.connect()]);
    redisLogger.info("✅ Both Redis clients connected");
}

export async function disconnectRedis(): Promise<void> {
    if (pub) await pub.quit();
    if (sub) await sub.quit();
    redisLogger.info("Redis clients disconnected");
}

/**
 * Publish a document update to the Redis Pub/Sub channel AND the Redis Stream.
 *
 * - Pub/Sub channel `doc:<docId>` → for cross-node real-time relay
 * - Redis Stream `doc_updates` → for the persist-worker to consume
 */
export async function publishUpdate(
    docId: string,
    userId: string,
    update: Uint8Array
): Promise<void> {
    const publisher = getPublisher();
    const encodedUpdate = Buffer.from(update).toString("base64");

    const message = JSON.stringify({
        docId,
        userId,
        delta: encodedUpdate,
        nodeId: config.nodeId,
        timestamp: Date.now(),
    });

    // 1. Pub/Sub for cross-node sync
    await publisher.publish(`doc:${docId}`, message);

    // 2. Redis Stream for persist-worker
    await publisher.xadd(
        "doc_updates",
        "*", // auto-generate ID
        "docId", docId,
        "userId", userId,
        "delta", encodedUpdate,
        "nodeId", config.nodeId,
        "timestamp", Date.now().toString()
    );
}

/**
 * Subscribe to a document's Pub/Sub channel for cross-node updates.
 */
export async function subscribeToDocument(
    docId: string,
    handler: (message: string) => void
): Promise<void> {
    const subscriber = getSubscriber();
    const channel = `doc:${docId}`;

    subscriber.on("message", (ch, msg) => {
        if (ch === channel) {
            handler(msg);
        }
    });

    await subscriber.subscribe(channel);
    redisLogger.debug({ docId, channel }, "Subscribed to document channel");
}

/**
 * Unsubscribe from a document's Pub/Sub channel.
 */
export async function unsubscribeFromDocument(docId: string): Promise<void> {
    const subscriber = getSubscriber();
    await subscriber.unsubscribe(`doc:${docId}`);
    redisLogger.debug({ docId }, "Unsubscribed from document channel");
}
