"use client";

import { useParams } from "next/navigation";
import { Protected } from "@/components/auth/protected";
import { SiteHeader } from "@/components/layout/site-header";
import { EditorPage } from "@/components/editor/editor-page";

export default function DocumentRoute() {
  const params = useParams<{ id: string }>();

  return (
    <Protected>
      <div className="workspace-bg flex min-h-screen flex-col">
        <SiteHeader />
        <EditorPage docId={params.id} />
      </div>
    </Protected>
  );
}
