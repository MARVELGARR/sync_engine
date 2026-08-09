import rateLimit from "express-rate-limit";
import { logger } from "../utils/logger.js";

// ─── Auth Rate Limiter ───────────────────────────────────────────
// Strict limit for auth endpoints to prevent brute-force attacks.
// 10 requests per 15 minutes per IP (e.g. 10 login attempts).
export const authRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    limit: 10,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many requests from this IP, please try again later.",
    },
    handler(req, res, _next, options) {
        logger.warn(
            {
                ip: req.ip,
                path: req.path,
                limit: options.limit,
                windowMs: options.windowMs,
            },
            "Auth rate limit exceeded"
        );
        res.status(options.statusCode).json(options.message);
    },
});

// ─── API Rate Limiter ────────────────────────────────────────────
// General limit for all other API endpoints.
// 120 requests per minute per IP.
export const apiRateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    limit: 120,
    standardHeaders: "draft-7",
    legacyHeaders: false,
    message: {
        success: false,
        error: "Too many requests from this IP, please try again later.",
    },
    handler(req, res, _next, options) {
        logger.warn(
            {
                ip: req.ip,
                path: req.path,
                limit: options.limit,
                windowMs: options.windowMs,
            },
            "API rate limit exceeded"
        );
        res.status(options.statusCode).json(options.message);
    },
    // Skip rate limiting for the health check endpoint
    skip: (req) => req.path === "/api/health",
});
