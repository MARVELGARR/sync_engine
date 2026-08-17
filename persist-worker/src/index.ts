import Redis from "ioredis";
import { config } from "./config/env.js";
import { persistLogger, streamLogger } from "./utils/logger.js";
import { applyDelta, periodicFlush, flushAllBuffers } from "./buffer/delta.buffer.js";
import { closePool } from "./db/snapshot.writer.js";

let redis: Redis;
let running = true;

// ─── Initialize Redis Consumer Group ────────────────────────────
async function initConsumerGroup(): Promise<void> {
    try {
        // Create the consumer group if it doesn't exist.
        // "0" means start reading from the beginning of the stream.
        // MKSTREAM creates the stream if it doesn't exist.
        await redis.xgroup(
            "CREATE",
            config.streamName,
            config.consumerGroup,
            "0",
            "MKSTREAM"
        );
        streamLogger.info(
            { group: config.consumerGroup, stream: config.streamName },
            "Consumer group created"
        );
    } catch (err: any) {
        // BUSYGROUP means the group already exists — that's fine
        if (err.message && err.message.includes("BUSYGROUP")) {
            streamLogger.info("Consumer group already exists — resuming");
        } else {
            throw err;
        }
    }
}

// ─── Stream Consumer Loop ───────────────────────────────────────
async function consumeStream(): Promise<void> {
    streamLogger.info(
        {
            stream: config.streamName,
            group: config.consumerGroup,
            consumer: config.consumerName,
        },
        "Starting stream consumer loop"
    );

    while (running) {
        try {
            // XREADGROUP: read new messages for this consumer.
            // ">" means only deliver messages that have never been delivered to this consumer.
            // BLOCK waits for new messages if none are available.
            const results = (await redis.xreadgroup(
                "GROUP",
                config.consumerGroup,
                config.consumerName,
                "COUNT",
                config.batchSize,
                "BLOCK",
                config.blockTimeoutMs,
                "STREAMS",
                config.streamName,
                ">"
            )) as any;

            if (!results || results.length === 0) {
                // No messages — the BLOCK timed out. Loop again.
                continue;
            }

            // Process each stream's messages
            for (const [_streamName, messages] of results) {
                for (const [messageId, fields] of messages) {
                    // Parse the fields array into a key-value object
                    const data: Record<string, string> = {};
                    for (let i = 0; i < fields.length; i += 2) {
                        data[fields[i]] = fields[i + 1];
                    }

                    const { docId, userId, delta } = data;

                    if (!docId || !delta) {
                        streamLogger.warn({ messageId }, "Skipping malformed message");
                        await redis.xack(config.streamName, config.consumerGroup, messageId);
                        continue;
                    }

                    // Apply the delta to the in-memory buffer
                    await applyDelta(docId, delta, userId || "unknown");

                    // Acknowledge the message so it won't be re-delivered
                    await redis.xack(config.streamName, config.consumerGroup, messageId);
                }
            }
        } catch (err) {
            if (!running) break; // Shutdown in progress
            streamLogger.error({ err }, "Error in stream consumer loop — retrying in 1s");
            await sleep(1000);
        }
    }
}

// ─── Periodic Flush Timer ───────────────────────────────────────
let flushTimer: ReturnType<typeof setInterval>;

function startPeriodicFlush(): void {
    flushTimer = setInterval(async () => {
        try {
            await periodicFlush();
        } catch (err) {
            persistLogger.error({ err }, "Error in periodic flush");
        }
    }, config.flushIntervalMs);

    persistLogger.info(
        { intervalMs: config.flushIntervalMs },
        "Periodic flush timer started"
    );
}

// ─── Start ──────────────────────────────────────────────────────
async function start(): Promise<void> {
    try {
        // Connect to Redis
        redis = new Redis(config.redisUrl);
        redis.on("error", (err) => streamLogger.error({ err }, "Redis error"));
        redis.on("connect", () => streamLogger.info("✅ Connected to Redis"));

        // Initialize the consumer group
        await initConsumerGroup();

        // Start the periodic flush timer
        startPeriodicFlush();

        // Start consuming the stream (this runs indefinitely)
        persistLogger.info("💾 Persist Worker started");
        await consumeStream();
    } catch (err) {
        persistLogger.error({ err }, "Failed to start Persist Worker");
        process.exit(1);
    }
}

// ─── Graceful Shutdown ──────────────────────────────────────────
async function shutdown(): Promise<void> {
    persistLogger.info("Shutting down Persist Worker...");

    // Stop the consumer loop
    running = false;

    // Stop the periodic flush timer
    if (flushTimer) clearInterval(flushTimer);

    // Flush all remaining buffers to DB
    await flushAllBuffers();

    // Close connections
    if (redis) await redis.quit();
    await closePool();

    persistLogger.info("Persist Worker shut down cleanly");
    process.exit(0);
}

process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);

// ─── Utility ────────────────────────────────────────────────────
function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

start();
