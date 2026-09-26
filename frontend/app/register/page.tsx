"use client";

import { SiteHeader } from "@/components/layout/site-header";
import { RegisterForm } from "@/components/auth/register-form";

export default function RegisterPage() {
  return (
    <div className="workspace-bg min-h-screen">
      <SiteHeader />
      <main className="mx-auto flex max-w-6xl flex-col items-center px-4 py-14">
        <RegisterForm />
      </main>
    </div>
  );
}
