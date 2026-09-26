"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ShareDialog } from "@/components/sharing/share-dialog";
import { useAuthStore } from "@/stores/use-auth-store";
import { ApiError } from "@/lib/api-client";
import { useAuthorize, useDocument } from "@/hooks/queries/use-documents";
import { useCollaborativeDoc } from "./use-collaborative-doc";
import { EditorTopbar } from "./editor-topbar";
import { EditorCanvas } from "./editor-canvas";
import { CollaboratorsPanel } from "./collaborators-panel";

/**
 * Collaborative editor orchestration: server metadata/permission via
 * React Query, live content via the collaborative-doc hook.
 */
export function EditorPage({ docId }: { docId: string }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const token = useAuthStore((s) => s.token);

  const docQuery = useDocument(docId);
  const authQuery = useAuthorize(docId);

  const [shareOpen, setShareOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const permission = authQuery.data?.permission ?? null;
  const isOwner = !!user && !!docQuery.data && docQuery.data.ownerId === user.id;
  const readOnly = permission === "read";

  const { status, statusDetail, presence, text, lastActivity, onChange, requestSync } =
    useCollaborativeDoc({ docId, user, token, readOnly });

  // Expired token while editing -> back to login.
  useEffect(() => {
    if (status === "unauthorized") {
      const t = setTimeout(() => router.push("/login"), 1800);
      return () => clearTimeout(t);
    }
  }, [status, router]);

  const loading = docQuery.isLoading || authQuery.isLoading;
  const loadError = docQuery.error ?? authQuery.error;
  const denied =
    status === "denied" ||
    (authQuery.data && !authQuery.data.authorized) ||
    (loadError instanceof ApiError && (loadError.status === 403 || loadError.status === 404));

  // Pull latest server state on demand: refetch metadata/permission, then
  // re-run the Yjs handshake so snapshots flushed to the DB after we
  // connected are merged in. This is the recovery path when a joinee
  // opened the doc before the owner's edits were persisted.
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([docQuery.refetch(), authQuery.refetch()]);
      if (!requestSync()) {
        toast.message("Reconnecting… sync will resume when connected.");
      } else {
        toast.success("Refreshed — pulling latest content.");
      }
    } catch {
      toast.error("Could not refresh. Try again.");
    } finally {
      setRefreshing(false);
    }
  }, [docQuery, authQuery, requestSync]);

  const onRetry = useCallback(() => {
    docQuery.refetch();
    authQuery.refetch();
  }, [docQuery, authQuery]);

  return (
    <>
      <EditorTopbar
        docId={docId}
        title={docQuery.data?.title}
        permission={permission}
        isOwner={isOwner}
        readOnly={readOnly}
        status={status}
        statusDetail={statusDetail}
        presence={presence}
        refreshing={refreshing}
        loading={loading}
        onRefresh={onRefresh}
        onShare={() => setShareOpen(true)}
      />

      <main className="mx-auto grid w-full max-w-6xl flex-1 gap-4 px-4 py-6 lg:grid-cols-[1fr_280px]">
        <EditorCanvas
          loading={loading}
          denied={denied}
          loadError={loadError}
          onRetry={onRetry}
          text={text}
          lastActivity={lastActivity}
          readOnly={readOnly}
          onChange={onChange}
        />
        <CollaboratorsPanel
          presence={presence}
          currentUserName={user?.displayName}
          isOwner={isOwner}
          onShare={() => setShareOpen(true)}
        />
      </main>

      <ShareDialog docId={docId} open={shareOpen} onOpenChange={setShareOpen} />
    </>
  );
}
