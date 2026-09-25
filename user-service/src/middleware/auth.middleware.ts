import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../services/auth.service.js";
import { findUserById } from "../dal/queries.js";
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
 * Auth middleware — verifies the JWT (signature + issuer/audience/expiry),
 * then checks it against the live user row:
 *  - user still exists
 *  - token version matches (revoked after password set / guest claim)
 *  - guest sessions haven't expired
 * Attaches the decoded payload to `req.user` for downstream handlers.
 */
export async function authMiddleware(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
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

        const user = await findUserById(payload.sub);
        if (!user) {
            res.status(401).json({ success: false, error: "User no longer exists" });
            return;
        }
        if ((payload.tv ?? 0) !== ((user as any).tokenVersion ?? 0)) {
            res.status(401).json({
                success: false,
                error: "Session revoked — please log in again",
            });
            return;
        }
        if ((user as any).isGuest && (user as any).guestExpiresAt) {
            if (new Date((user as any).guestExpiresAt).getTime() <= Date.now()) {
                res.status(401).json({
                    success: false,
                    error: "Guest session expired — please create an account",
                });
                return;
            }
        }

        req.user = {
            ...payload,
            isGuest: (user as any).isGuest ?? payload.isGuest ?? false,
        };
        next();
    } catch (err) {
        authLogger.warn({ err }, "JWT verification failed");
        res.status(401).json({
            success: false,
            error: "Invalid or expired token",
        });
    }
}
