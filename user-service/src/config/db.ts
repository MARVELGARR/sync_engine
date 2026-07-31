import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { config } from "./env.js";
import { logger } from "../utils/logger.js";

const pool = new Pool({
    connectionString: config.databaseUrl,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
});

pool.on("error", (err) => {
    logger.error({ err }, "Unexpected PostgreSQL pool error");
});

export const db = drizzle(pool);
export { pool };

export async function connectDb(): Promise<void> {
    try {
        const client = await pool.connect();
        client.release();
        logger.info("✅ Connected to PostgreSQL");
    } catch (err) {
        logger.error({ err }, "❌ Failed to connect to PostgreSQL");
        throw err;
    }
}
