import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "../config/env.js";
import { authLogger } from "../utils/logger.js";
import * as queries from "../dal/queries.js";
import type { JWTPayload } from "./types.js";

const SALT_ROUNDS = 12;

// ─── Register ───────────────────────────────────────────────────
export async function registerUser(
    email: string,
    password: string,
    displayName: string
) {
    // Check if user already exists
    const existing = await queries.findUserByEmail(email);
    if (existing) {
        throw new AppError("Email already registered", 409);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    // Create user
    const user = await queries.createUser({
        email,
        passwordHash,
        displayName,
    });

    authLogger.info({ userId: user.id }, "User registered");

    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
    };
}

// ─── Login ──────────────────────────────────────────────────────
export async function loginUser(email: string, password: string) {
    const user = await queries.findUserByEmail(email);
    if (!user) {
        throw new AppError("Invalid email or password", 401);
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
        throw new AppError("Invalid email or password", 401);
    }

    // Generate JWT
    const payload: Omit<JWTPayload, "iat" | "exp"> = {
        sub: user.id,
        email: user.email,
        displayName: user.displayName,
    };

    const token = jwt.sign(payload, config.jwtSecret, {
        expiresIn: config.jwtExpiry,
    });

    authLogger.info({ userId: user.id }, "User logged in");

    return {
        token,
        user: {
            id: user.id,
            email: user.email,
            displayName: user.displayName,
        },
    };
}

// ─── Verify Token ───────────────────────────────────────────────
export function verifyToken(token: string): JWTPayload {
    try {
        return jwt.verify(token, config.jwtSecret) as JWTPayload;
    } catch {
        throw new AppError("Invalid or expired token", 401);
    }
}

// ─── Get User Profile ───────────────────────────────────────────
export async function getUserProfile(userId: string) {
    const user = await queries.findUserById(userId);
    if (!user) {
        throw new AppError("User not found", 404);
    }
    return user;
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
