import bcrypt from "bcryptjs";
import crypto from "node:crypto";
import jwt from "jsonwebtoken";
import { randomUUID } from "node:crypto";
import { config } from "../config/env.js";
import { authLogger } from "../utils/logger.js";
import * as queries from "../dal/queries.js";
import type { JWTPayload, TokenType } from "./types.js";

const SALT_ROUNDS = 12;
// 7 days in ms — fallback if GUEST_EXPIRY is unparsable (jsonwebtoken parses it for signing).
const GUEST_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

// Small random delay on auth failure — flattens timing differences between
// "user not found" and "wrong password" so attackers can't enumerate accounts.
function failureDelay(): Promise<void> {
    const ms = 100 + Math.floor(Math.random() * 150);
    return new Promise((r) => setTimeout(r, ms));
}

function issueToken(args: {
    userId: string;
    email: string;
    displayName: string;
    type: TokenType;
    isGuest: boolean;
    tokenVersion: number;
    expiresIn?: string;
}): string {
    const payload = {
        sub: args.userId,
        email: args.email,
        displayName: args.displayName,
        type: args.type,
        isGuest: args.isGuest,
        tv: args.tokenVersion,
    };
    return jwt.sign(payload, config.jwtSecret, {
        expiresIn: (args.expiresIn ?? config.jwtExpiry) as any,
        issuer: config.jwtIssuer,
        audience: config.jwtAudience,
        jwtid: randomUUID(),
    });
}

function publicUser(row: {
    id: string;
    email: string;
    displayName: string;
    isGuest?: boolean | null;
    createdAt?: unknown;
}) {
    return {
        id: row.id,
        email: row.email,
        displayName: row.displayName,
        isGuest: row.isGuest ?? false,
        createdAt: row.createdAt,
    };
}

function isGuestExpired(row: { guestExpiresAt?: Date | string | null }): boolean {
    if (!row.guestExpiresAt) return false;
    return new Date(row.guestExpiresAt).getTime() <= Date.now();
}

// ─── Register ───────────────────────────────────────────────────
export async function registerUser(
    email: string,
    password: string,
    displayName: string
) {
    const normalized = normalizeEmail(email);
    const existing = await queries.findUserByEmail(normalized);
    if (existing) {
        throw new AppError("Email already registered", 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await queries.createUser({
        email: normalized,
        passwordHash,
        displayName: displayName.trim(),
    });

    authLogger.info({ userId: user.id }, "User registered");

    return { ...publicUser(user), createdAt: user.createdAt };
}

// ─── Login ──────────────────────────────────────────────────────
export async function loginUser(email: string, password: string) {
    const normalized = normalizeEmail(email);
    const user = await queries.findUserByEmail(normalized);
    if (!user) {
        await failureDelay();
        throw new AppError("Invalid email or password", 401);
    }

    // Guests have a random unknowable password — they must use refresh or claim.
    if ((user as any).isGuest) {
        if (isGuestExpired(user as any)) {
            throw new AppError("Guest session expired — please create an account", 401);
        }
        await failureDelay();
        throw new AppError("Invalid email or password", 401);
    }

    const isValid = await bcrypt.compare(password, (user as any).passwordHash);
    if (!isValid) {
        await failureDelay();
        throw new AppError("Invalid email or password", 401);
    }

    const token = issueToken({
        userId: (user as any).id,
        email: (user as any).email,
        displayName: (user as any).displayName,
        type: "access",
        isGuest: false,
        tokenVersion: (user as any).tokenVersion ?? 0,
    });

    authLogger.info({ userId: (user as any).id }, "User logged in");

    return {
        token,
        user: publicUser(user as any),
    };
}

// ─── Guest ──────────────────────────────────────────────────────
// Creates an ephemeral guest account and returns a guest-scoped JWT.
// Guests can create/edit documents but cannot share until they claim an account.
export async function createGuestUser(displayName?: string) {
    const suffix =
        displayName?.trim() ||
        `Guest ${crypto.randomInt(1000, 9999).toString()}`;
    // Guest rows need a globally unique login-proof email; it can never be
    // used for password login (random 32-byte password, immediately discarded).
    const email = `guest_${randomUUID()}@guest.local`;
    const passwordHash = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), SALT_ROUNDS);

    const user = await queries.createUser({
        email,
        passwordHash,
        displayName: suffix.slice(0, 100),
        isGuest: true,
        guestExpiresAt: new Date(Date.now() + GUEST_TTL_MS),
    });

    const token = issueToken({
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        type: "guest",
        isGuest: true,
        tokenVersion: (user as any).tokenVersion ?? 0,
        expiresIn: config.guestExpiry as any,
    });

    authLogger.info({ userId: user.id }, "Guest session created");

    return { token, user: publicUser(user as any) };
}

// ─── Claim guest ────────────────────────────────────────────────
// Converts a guest account into a full account (new credentials, old guest
// tokens revoked via tokenVersion bump).
export async function claimGuestAccount(
    guestId: string,
    email: string,
    password: string,
    displayName?: string
) {
    const guest = await queries.findUserById(guestId);
    if (!guest || !(guest as any).isGuest) {
        throw new AppError("Only guest sessions can be claimed", 400);
    }
    if (isGuestExpired(guest as any)) {
        throw new AppError("Guest session expired — please register instead", 401);
    }

    const normalized = normalizeEmail(email);
    const existing = await queries.findUserByEmail(normalized);
    if (existing) {
        throw new AppError("Email already registered", 409);
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    const updated = await queries.claimGuestUser(guestId, {
        email: normalized,
        passwordHash,
        displayName: (displayName?.trim() || (guest as any).displayName).slice(0, 100),
    });
    if (!updated) {
        throw new AppError("Only guest sessions can be claimed", 400);
    }

    const token = issueToken({
        userId: updated.id,
        email: updated.email,
        displayName: updated.displayName,
        type: "access",
        isGuest: false,
        tokenVersion: (updated as any).tokenVersion ?? 0,
    });

    authLogger.info({ userId: updated.id }, "Guest claimed full account");

    return { token, user: publicUser(updated as any) };
}

// ─── Verify Token ───────────────────────────────────────────────
export function verifyToken(token: string): JWTPayload {
    try {
        // Strict issuer/audience binding for newly issued tokens, with a
        // grace path for legacy tokens minted before iss/aud were added
        // (they verify by signature only and are replaced on next login).
        try {
            return jwt.verify(token, config.jwtSecret, {
                issuer: config.jwtIssuer,
                audience: config.jwtAudience,
            }) as JWTPayload;
        } catch (err: any) {
            if (err?.name === "JsonWebTokenError" && /jwt (issuer|audience)/.test(err.message)) {
                const legacy = jwt.verify(token, config.jwtSecret) as JWTPayload;
                return {
                    ...legacy,
                    type: legacy.type ?? "access",
                    isGuest: legacy.isGuest ?? false,
                    tv: legacy.tv ?? 0,
                };
            }
            throw err;
        }
    } catch {
        throw new AppError("Invalid or expired token", 401);
    }
}

// ─── Refresh Token ──────────────────────────────────────────────
export async function refreshToken(currentToken: string) {
    const payload = verifyToken(currentToken);

    const user = await queries.findUserById(payload.sub);
    if (!user) {
        throw new AppError("User no longer exists", 401);
    }
    // Token rotation: reject tokens minted before the last credential change.
    if ((payload.tv ?? 0) !== ((user as any).tokenVersion ?? 0)) {
        throw new AppError("Session revoked — please log in again", 401);
    }
    if ((user as any).isGuest && isGuestExpired(user as any)) {
        throw new AppError("Guest session expired — please create an account", 401);
    }

    const isGuest = (user as any).isGuest ?? false;
    const token = issueToken({
        userId: (user as any).id,
        email: (user as any).email,
        displayName: (user as any).displayName,
        type: isGuest ? "guest" : "access",
        isGuest,
        tokenVersion: (user as any).tokenVersion ?? 0,
        expiresIn: (isGuest ? config.guestExpiry : config.jwtExpiry) as any,
    });

    authLogger.info({ userId: (user as any).id }, "Token refreshed");

    return { token, user: publicUser(user as any) };
}

// ─── Get User Profile ───────────────────────────────────────────
export async function getUserProfile(userId: string) {
    const user = await queries.findUserById(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return publicUser(user as any);
}

// ─── Custom Error Class ─────────────────────────────────────────
export class AppError extends Error {
    constructor(
        message: string,
        public statusCode: number
    ) {
        super(message);
        this.name = "AppError";
    }
}
