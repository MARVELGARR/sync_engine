// Canonical query hooks per frontend-web-stack (`hooks/queries/use-*.ts`).
// Re-exported here so existing `@/lib/documents` imports keep working.
export {
  docKeys,
  useDocuments,
  useDocument,
  useAuthorize,
  useCreateDocument,
  useDeleteDocument,
  useShareDocument,
  useRevokeShare,
} from "@/hooks/queries/use-documents";
