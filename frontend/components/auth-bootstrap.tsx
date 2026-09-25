"use client";

import { useEffect } from "react";
import { useAuthStore } from "@/lib/auth-store";

export function AuthBootstrap() {
  const bootstrap = useAuthStore((s) => s.bootstrap);
  useEffect(() => {
    void bootstrap();
  }, [bootstrap]);
  return null;
}
