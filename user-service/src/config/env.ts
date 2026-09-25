import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

const isProd = process.env.NODE_ENV === "production";

if (isProd && !process.env.JWT_SECRET) {
    throw new Error(
        "JWT_SECRET must be set in production — refusing to start with a default secret."
    );
}

export const config = {
    port: parseInt(process.env.PORT || "3000", 10),
    databaseUrl: process.env.DATABASE_URL || "postgresql://sync_admin:changeme@localhost:5432/sync_engine",
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    jwtExpiry: process.env.JWT_EXPIRY || "24h",
    jwtIssuer: process.env.JWT_ISSUER || "sync-engine",
    jwtAudience: process.env.JWT_AUDIENCE || "sync-engine-app",
    // Ephemeral guest sessions live 7 days, then require conversion.
    guestExpiry: process.env.GUEST_EXPIRY || "7d",
    // Comma-separated list of allowed browser origins (CORS).
    // "http://localhost" covers the gateway on :80 (same-origin prod).
    // "http://localhost:3000" covers direct Next.js dev / debug access.
    // Lock down in production via CORS_ORIGINS env (or "*" for open dev).
    corsOrigins: (process.env.CORS_ORIGINS || "http://localhost,http://localhost:3000")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    nodeEnv: process.env.NODE_ENV || "development",
} as const;
