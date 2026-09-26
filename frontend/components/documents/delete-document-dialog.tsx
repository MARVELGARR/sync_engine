"use client";

import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import { useDeleteDocument } from "@/hooks/queries/use-documents";

interface DeleteDocumentDialogProps {
  docId: string | null;
  onClose: () => void;
}

export function DeleteDocumentDialog({ docId, onClose }: DeleteDocumentDialogProps) {
  const deleteDoc = useDeleteDocument();

  const onDelete = async () => {
    if (!docId) return;
    try {
      await deleteDoc.mutateAsync(docId);
      toast.success("Document deleted");
      onClose();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not delete document");
    }
  };

  return (
    <Dialog open={docId !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogHeader>
        <DialogTitle>Delete document?</DialogTitle>
        <DialogDescription>
          This permanently removes the document for everyone it was shared with. This cannot be undone.
        </DialogDescription>
      </DialogHeader>
      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button variant="destructive" className="flex-1" onClick={onDelete} disabled={deleteDoc.isPending}>
          {deleteDoc.isPending && <Loader2 className="animate-spin" />}
          Delete
        </Button>
      </div>
    </Dialog>
  );
}
