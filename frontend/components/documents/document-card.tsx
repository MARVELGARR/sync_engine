"use client";

import Link from "next/link";
import { FileText, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { SyncDocument } from "@/lib/types";

interface DocumentCardProps {
  doc: SyncDocument;
  onDelete: (id: string) => void;
}

export function DocumentCard({ doc, onDelete }: DocumentCardProps) {
  return (
    <Card className="group transition-shadow hover:shadow-md hover:shadow-brand-100">
      <CardContent className="p-5">
        <div className="mb-3 flex items-start justify-between gap-2">
          <span className="flex size-10 items-center justify-center rounded-lg bg-brand-600 text-white">
            <FileText className="size-5" />
          </span>
          {doc.isOwner ? (
            <Badge variant="secondary">Owner</Badge>
          ) : (
            <Badge variant="outline">Shared</Badge>
          )}
        </div>
        <Link href={`/documents/${doc.id}`} className="block">
          <h3 className="truncate font-semibold text-brand-950 hover:text-brand-600">{doc.title}</h3>
        </Link>
        <p className="mt-1 text-xs text-slate-400">
          Updated {new Date(doc.updatedAt).toLocaleString()}
        </p>
        <div className="mt-4 flex items-center gap-2">
          <Link href={`/documents/${doc.id}`} className="flex-1">
            <Button size="sm" className="w-full">Open</Button>
          </Link>
          {doc.isOwner && (
            <Button size="sm" variant="outline" onClick={() => onDelete(doc.id)} aria-label={`Delete ${doc.title}`}>
              <Trash2 className="text-red-500" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
