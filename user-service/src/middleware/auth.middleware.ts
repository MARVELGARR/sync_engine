import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth.service.js";
import { authLogger } from "../utils/logger.js";
import type { JWTPayload } from "../services/types.js";

// Extend Express Request to carry the authenticated user
declare global {
    namespace Express {
        interface Request {
            user?: JWTPayload;
        }
    }
}

/**
 * Auth middleware — extracts and verifies the JWT from the Authorization header.
 * Attaches the decoded payload to `req.user` for downstream handlers.
 */
export function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): void {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({
            success: false,
            error: "Missing or malformed Authorization header",
        });
        return;
    }

    const token = authHeader.slice(7); // Remove "Bearer "

    try {
        const payload = verifyToken(token);
        req.user = payload;
        next();
    } catch (err) {
        authLogger.warn({ err }, "JWT verification failed");
        res.status(401).json({
            success: false,
            error: "Invalid or expired token",
        });
    }
}
