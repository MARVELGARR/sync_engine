import { z } from "zod";

export const registerSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z
        .string()
        .min(8, "Password must be at least 8 characters")
        .max(128, "Password must not exceed 128 characters"),
    displayName: z
        .string()
        .min(2, "Display name must be at least 2 characters")
        .max(100, "Display name must not exceed 100 characters")
        .trim(),
});

export const loginSchema = z.object({
    email: z.string().email("Invalid email address"),
    password: z.string().min(1, "Password is required"),
});

export const createDocumentSchema = z.object({
    title: z
        .string()
        .min(1, "Title is required")
        .max(255, "Title must not exceed 255 characters")
        .trim(),
});

export const shareDocumentSchema = z.object({
    email: z.string().email("Invalid email address"),
    permission: z.enum(["read", "read-write"]),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;
