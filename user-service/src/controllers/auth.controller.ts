import { Request, Response, NextFunction } from "express";
import * as authService from "../services/auth.service.js";
import {
    registerSchema,
    loginSchema,
} from "../schemas/validation.js";

// ─── POST /api/auth/register ────────────────────────────────────
export async function register(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, password, displayName } = registerSchema.parse(req.body);
        const user = await authService.registerUser(email, password, displayName);
        res.status(201).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}

// ─── POST /api/auth/login ───────────────────────────────────────
export async function login(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, password } = loginSchema.parse(req.body);
        const result = await authService.loginUser(email, password);
        res.status(200).json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/auth/me ───────────────────────────────────────────
export async function me(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const userId = req.user!.sub;
        const user = await authService.getUserProfile(userId);
        res.status(200).json({ success: true, data: user });
    } catch (err) {
        next(err);
    }
}
