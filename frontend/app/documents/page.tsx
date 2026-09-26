"use client";

import { Suspense } from "react";
import { Protected } from "@/components/auth/protected";
import { SiteHeader } from "@/components/layout/site-header";
import { DocumentsView } from "@/components/documents/documents-view";

export default function DocumentsPage() {
  return (
    <Suspense fallback={null}>
      <Protected>
        <div className="workspace-bg min-h-screen">
          <SiteHeader />
          <main className="mx-auto max-w-6xl px-4 py-8">
            <DocumentsView />
          </main>
        </div>
      </Protected>
    </Suspense>
  );
}
