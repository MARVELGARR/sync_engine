"use client";

import { Protected } from "@/components/auth/protected";
import { SiteHeader } from "@/components/layout/site-header";
import { ProfileView } from "@/components/settings/profile-view";

export default function ProfilePage() {
  return (
    <Protected>
      <div className="workspace-bg min-h-screen">
        <SiteHeader />
        <main className="mx-auto max-w-2xl px-4 py-10">
          <ProfileView />
        </main>
      </div>
    </Protected>
  );
}
