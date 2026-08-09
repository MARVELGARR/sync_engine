import { defineConfig } from "drizzle-kit";
import dotenv from "dotenv";
dotenv.config({ path: "../.env" });

export default defineConfig({
    schema: "./src/db/schema.ts",
    out: "./drizzle/migrations",
    dialect: "postgresql",
    dbCredentials: {
        url: process.env.DATABASE_URL || "postgresql://sync_admin:changeme@localhost:5432/sync_engine",
    },
    verbose: true,
    strict: true,
});
