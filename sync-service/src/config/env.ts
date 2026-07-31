import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

export const config = {
    port: parseInt(process.env.SYNC_SERVICE_PORT || "4000", 10),
    nodeId: process.env.NODE_ID || "sync-1",
    redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    userServiceUrl: process.env.USER_SERVICE_URL || "http://localhost:3000",
    databaseUrl: process.env.DATABASE_URL || "postgresql://sync_admin:changeme@localhost:5432/sync_engine",

    // Room cleanup: destroy empty rooms after this many ms
    roomCleanupDelayMs: 30_000,

    // Heartbeat / ping-pong
    pingIntervalMs: 30_000,
    pongTimeoutMs: 10_000,
} as const;
