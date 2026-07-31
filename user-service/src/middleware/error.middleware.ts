import { Request, Response, NextFunction } from "express";
import { ZodError, ZodSchema } from "zod";
import { AppError } from "../services/auth.service.js";
import { logger } from "../utils/logger.js";

/**
 * Global error handler middleware.
 * Catches AppError (known), ZodError (validation), and unknown errors.
 */
export function errorHandler(
    err: Error,
    _req: Request,
    res: Response,
    _next: NextFunction
): void {
    // Known application errors
    if (err instanceof AppError) {
        res.status(err.statusCode).json({
            success: false,
            error: err.message,
        });
        return;
    }

    // Zod validation errors
    if (err instanceof ZodError) {
        res.status(400).json({
            success: false,
            error: "Validation failed",
            details: err.errors.map((e) => ({
                field: e.path.join("."),
                message: e.message,
            })),
        });
        return;
    }

    // Unknown / unexpected errors
    logger.error({ err }, "Unhandled error");
    res.status(500).json({
        success: false,
        error: "Internal server error",
    });
}

/**
 * Factory: creates a middleware that validates req.body against a Zod schema.
 */
export function validateBody(schema: ZodSchema) {
    return (req: Request, _res: Response, next: NextFunction): void => {
        try {
            req.body = schema.parse(req.body);
            next();
        } catch (err) {
            next(err);
        }
    };
}
