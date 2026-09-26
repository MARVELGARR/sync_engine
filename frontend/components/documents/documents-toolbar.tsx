"use client";

import { ArrowUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { DocumentsFilter, DocumentsSort } from "@/app/documents/searchParams";

interface DocumentsToolbarProps {
  query: string;
  onQueryChange: (v: string) => void;
  filter: DocumentsFilter;
  onFilterChange: (v: DocumentsFilter) => void;
  sort: DocumentsSort;
  onSortChange: (v: DocumentsSort) => void;
  counts: { all: number; owned: number; shared: number };
}

const FILTERS: DocumentsFilter[] = ["all", "owned", "shared"];

export function DocumentsToolbar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
  sort,
  onSortChange,
  counts,
}: DocumentsToolbarProps) {
  const cycleSort = () =>
    onSortChange(sort === "updated" ? "title" : sort === "title" ? "created" : "updated");

  return (
    <Card className="mb-4">
      <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-brand-300" />
          <Input
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search documents…"
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-2">
          {FILTERS.map((f) => (
            <Button
              key={f}
              size="sm"
              variant={filter === f ? "default" : "outline"}
              onClick={() => onFilterChange(f)}
              className="capitalize"
            >
              {f} {f === "all" ? `(${counts.all})` : f === "owned" ? `(${counts.owned})` : `(${counts.shared})`}
            </Button>
          ))}
          <Button size="sm" variant="ghost" onClick={cycleSort}>
            <ArrowUpDown /> {sort === "updated" ? "Recent" : sort === "title" ? "A–Z" : "Newest"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
