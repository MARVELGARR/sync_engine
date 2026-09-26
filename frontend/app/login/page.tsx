"use client";

import { SiteHeader } from "@/components/layout/site-header";
import { LoginForm } from "@/components/auth/login-form";

export default function LoginPage() {
  return (
    <div className="workspace-bg min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col items-center px-4 py-14">
        <LoginForm />
      </main>
    </div>
  );
}
