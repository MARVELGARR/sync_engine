import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { syncLogger } from "../utils/logger.js";

export interface JWTPayload {
    sub: string;
    email: string;
    displayName: string;
    iat: number;
    exp: number;
}

export interface AuthorizeResult {
    authorized: boolean;
    permission: "read" | "read-write" | null;
    userId: string;
    documentId: string;
}

/**
 * Verify a JWT token locally using the shared secret.
 */
export function verifyToken(token: string): JWTPayload {
    return jwt.verify(token, config.jwtSecret) as JWTPayload;
}

/**
 * Call the user-service to check if a user has access to a specific document.
 * This performs a network call to GET /api/documents/:docId/authorize
 */
export async function authorizeUser(
    token: string,
    docId: string
): Promise<AuthorizeResult> {
    const url = `${config.userServiceUrl}/api/documents/${docId}/authorize`;

    try {
        const response = await fetch(url, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${token}`,
                "Content-Type": "application/json",
            },
        });

        if (!response.ok) {
            syncLogger.warn(
                { docId, status: response.status },
                "Authorization request failed"
            );
            return { authorized: false, permission: null, userId: "", documentId: docId };
        }

        const data = (await response.json()) as AuthorizeResult;
        return data;
    } catch (err) {
        syncLogger.error({ err, docId }, "Failed to reach user-service for authorization");
        return { authorized: false, permission: null, userId: "", documentId: docId };
    }
}
