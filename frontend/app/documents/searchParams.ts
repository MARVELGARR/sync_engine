import { parseAsString, parseAsStringLiteral, createLoader } from "nuqs/server";

/**
 * URL-owned workspace state per frontend-web-stack.
 * filter / sort / search survive refresh and are shareable via link.
 * Owned by nuqs — never mirror into Zustand or useState.
 */
export const documentsSearchParams = {
  q: parseAsString.withDefault(""),
  filter: parseAsStringLiteral(["all", "owned", "shared"] as const).withDefault("all"),
  sort: parseAsStringLiteral(["updated", "created", "title"] as const).withDefault("updated"),
};

export const loadDocumentsSearchParams = createLoader(documentsSearchParams);

export type DocumentsFilter = "all" | "owned" | "shared";
export type DocumentsSort = "updated" | "created" | "title";
