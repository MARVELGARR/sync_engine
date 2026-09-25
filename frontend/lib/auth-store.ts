// Canonical auth store location per frontend-web-stack (`stores/use-*-store.ts`).
// Re-exported here so existing `@/lib/auth-store` imports keep working.
export { useAuthStore, isGuestUser } from "@/stores/use-auth-store";
