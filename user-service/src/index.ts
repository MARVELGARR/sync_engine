import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { config } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/error.middleware.js";

import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/document.routes.js";

const app = express();

// ─── Global Middleware ──────────────────────────────────────────
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ─── Health Check ───────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", service: "user-service" });
});

// ─── Routes ─────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/documents", documentRoutes);

// ─── Global Error Handler ───────────────────────────────────────
app.use(errorHandler);

// ─── Start Server ───────────────────────────────────────────────
async function start() {
    try {
        await connectDb();
        app.listen(config.port, () => {
            logger.info(`🚀 User Service running on port ${config.port}`);
        });
    } catch (err) {
        logger.error({ err }, "Failed to start User Service");
        process.exit(1);
    }
}

start();
