import { QueryClient } from "@tanstack/react-query";

/**
 * QueryClient factory per frontend-web-stack conventions.
 * - Browser: singleton per tab (avoids re-creating on every render).
 * - SSR / Server Components: fresh client per request (no cross-user cache leak).
 */
let browserClient: QueryClient | null = null;

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: 1,
        refetchOnWindowFocus: false,
        staleTime: 15_000,
      },
    },
  });
}

export function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserClient) browserClient = makeQueryClient();
  return browserClient;
}
