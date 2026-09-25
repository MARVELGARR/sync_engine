import express from "express";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";

import { config } from "./config/env.js";
import { connectDb } from "./config/db.js";
import { logger } from "./utils/logger.js";
import { errorHandler } from "./middleware/error.middleware.js";
import { apiRateLimiter } from "./middleware/rate-limit.middleware.js";

import authRoutes from "./routes/auth.routes.js";
import documentRoutes from "./routes/document.routes.js";

const app = express();

// ─── Trust Proxy (required for rate-limiting behind Nginx) ───────
app.set("trust proxy", 1);

// ─── Global Middleware ──────────────────────────────────────────
app.use(helmet());
app.use(
    cors({
        origin: (origin, cb) => {
            // Same-origin / server-to-server calls have no Origin header.
            if (!origin) return cb(null, true);
            if (config.corsOrigins.includes(origin)) return cb(null, true);
            cb(new Error("CORS: origin not allowed"));
        },
    })
);
// Cap JSON bodies — auth payloads are tiny; rejects oversized junk early.
app.use(express.json({ limit: "10kb" }));
app.use(cookieParser());

// ─── Global API Rate Limiter ────────────────────────────────────
// Applied to ALL routes. Auth routes have an additional stricter limiter.
app.use(apiRateLimiter);

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
