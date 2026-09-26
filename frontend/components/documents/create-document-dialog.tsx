"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api-client";
import { useCreateDocument } from "@/hooks/queries/use-documents";

interface CreateDocumentDialogProps {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

export function CreateDocumentDialog({ open, onOpenChange }: CreateDocumentDialogProps) {
  const createDoc = useCreateDocument();
  const [title, setTitle] = useState("");

  const onCreate = async () => {
    if (!title.trim()) return;
    try {
      const doc = await createDoc.mutateAsync(title.trim());
      toast.success(`“${doc.title}” created`);
      setTitle("");
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "Could not create document");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogHeader>
        <DialogTitle>New document</DialogTitle>
        <DialogDescription>Give it a title — you can share it after creating.</DialogDescription>
      </DialogHeader>
      <div className="space-y-3">
        <div className="space-y-2">
          <Label htmlFor="doc-title">Title</Label>
          <Input
            id="doc-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Product launch notes"
            onKeyDown={(e) => e.key === "Enter" && onCreate()}
            autoFocus
          />
        </div>
        <Button className="w-full" onClick={onCreate} disabled={createDoc.isPending || !title.trim()}>
          {createDoc.isPending && <Loader2 className="animate-spin" />}
          Create document
        </Button>
      </div>
    </Dialog>
  );
}
