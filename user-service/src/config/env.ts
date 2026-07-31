import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

export const config = {
    port: parseInt(process.env.PORT || "3000", 10),
    databaseUrl: process.env.DATABASE_URL || "postgresql://sync_admin:changeme@localhost:5432/sync_engine",
    jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
    jwtExpiry: process.env.JWT_EXPIRY || "24h",
    nodeEnv: process.env.NODE_ENV || "development",
} as const;
