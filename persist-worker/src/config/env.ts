import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

export const config = {
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    databaseUrl: process.env.DATABASE_URL || "postgresql://sync_admin:changeme@localhost:5432/sync_engine",
    nodeEnv: process.env.NODE_ENV || "development",

    // Flush thresholds
    flushIntervalMs: parseInt(process.env.FLUSH_INTERVAL_MS || "5000", 10),
    flushThreshold: parseInt(process.env.FLUSH_THRESHOLD || "50", 10),

    // Redis Stream consumer group
    streamName: "doc_updates",
    consumerGroup: "persist-workers",
    consumerName: process.env.CONSUMER_NAME || "worker-1",

    // How many stream entries to read per batch
    batchSize: 10,

    // Block timeout for XREADGROUP (ms) — how long to wait for new entries
    blockTimeoutMs: 2000,
} as const;
