import { Request, Response, NextFunction } from "express";
import * as docService from "../services/document.service.js";
import {
    createDocumentSchema,
    shareDocumentSchema,
} from "../schemas/validation.js";

// ─── POST /api/documents ────────────────────────────────────────
export async function create(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { title } = createDocumentSchema.parse(req.body);
        const doc = await docService.createDocument(title, req.user!.sub);
        res.status(201).json({ success: true, data: doc });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/documents ─────────────────────────────────────────
export async function list(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const docs = await docService.listDocuments(req.user!.sub);
        res.status(200).json({ success: true, data: docs });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/documents/:id ─────────────────────────────────────
export async function getById(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const doc = await docService.getDocument(req.params.id, req.user!.sub);
        res.status(200).json({ success: true, data: doc });
    } catch (err) {
        next(err);
    }
}

// ─── DELETE /api/documents/:id ──────────────────────────────────
export async function remove(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        await docService.deleteDocument(req.params.id, req.user!.sub);
        res.status(200).json({ success: true, message: "Document deleted" });
    } catch (err) {
        next(err);
    }
}

// ─── POST /api/documents/:id/share ──────────────────────────────
export async function share(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const { email, permission } = shareDocumentSchema.parse(req.body);
        const perm = await docService.shareDocument(
            req.params.id,
            req.user!.sub,
            email,
            permission
        );
        res.status(200).json({ success: true, data: perm });
    } catch (err) {
        next(err);
    }
}

// ─── DELETE /api/documents/:id/share/:userId ────────────────────
export async function revokeShare(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        await docService.revokeDocumentPermission(
            req.params.id,
            req.user!.sub,
            req.params.userId
        );
        res.status(200).json({ success: true, message: "Permission revoked" });
    } catch (err) {
        next(err);
    }
}

// ─── GET /api/documents/:id/authorize (Internal) ────────────────
export async function authorize(
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> {
    try {
        const result = await docService.authorizeDocumentAccess(
            req.params.id,
            req.user!.sub
        );
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
}
