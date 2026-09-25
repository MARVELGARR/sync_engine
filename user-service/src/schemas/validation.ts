import { z } from "zod";

// Normalise emails everywhere: trim + lowercase (prevents Foo@x.com / foo@x.com dupes).
const emailSchema = z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.string().email("Invalid email address").max(255));

// bcrypt truncates inputs at 72 bytes — accepting longer passwords would
// silently weaken them, so 72 is the honest maximum.
const passwordSchema = z
    .string()
    .min(8, "Password must be at least 8 characters")
    .max(72, "Password must not exceed 72 characters")
    .refine((v) => /[A-Za-z]/.test(v) && /[0-9]/.test(v), {
        message: "Password must contain at least one letter and one number",
    });

export const registerSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z
        .string()
        .min(2, "Display name must be at least 2 characters")
        .max(100, "Display name must not exceed 100 characters")
        .trim(),
});

export const loginSchema = z.object({
    email: emailSchema,
    password: z.string().min(1, "Password is required").max(72),
});

export const guestSchema = z.object({
    displayName: z
        .string()
        .trim()
        .min(2, "Display name must be at least 2 characters")
        .max(100, "Display name must not exceed 100 characters")
        .optional(),
});

// Claiming converts a guest session into a full account.
export const claimGuestSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
    displayName: z
        .string()
        .min(2, "Display name must be at least 2 characters")
        .max(100, "Display name must not exceed 100 characters")
        .trim()
        .optional(),
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
export type GuestInput = z.infer<typeof guestSchema>;
export type ClaimGuestInput = z.infer<typeof claimGuestSchema>;
export type CreateDocumentInput = z.infer<typeof createDocumentSchema>;
export type ShareDocumentInput = z.infer<typeof shareDocumentSchema>;
