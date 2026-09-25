"use client";

import * as React from "react";
import { Toaster as Sonner } from "sonner";

export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      toastOptions={{
        style: {
          background: "#ffffff",
          border: "1px solid #bfdbfe",
          color: "#1e3a8a",
        },
      }}
    />
  );
}

export { toast } from "sonner";
