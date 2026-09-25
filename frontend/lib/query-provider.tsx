"use client";

import * as React from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { getQueryClient } from "./query-client";

export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [qc] = React.useState(getQueryClient);
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}
