"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

let client: QueryClient | null = null;

function getClient() {
  if (!client) {
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 },
      },
    });
  }
  return client;
}

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(getClient);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
