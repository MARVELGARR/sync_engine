CREATE SCHEMA IF NOT EXISTS "documents_schema";
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents_schema"."document_deltas" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "document_id" uuid NOT NULL,
    "delta_data" "bytea" NOT NULL,
    "user_id" uuid,
    "applied_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "documents_schema"."document_snapshots" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "document_id" uuid NOT NULL,
    "snapshot_data" "bytea" NOT NULL,
    "snapshot_version" integer NOT NULL,
    "created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_doc_version" ON "documents_schema"."document_snapshots" USING btree (
    "document_id",
    "snapshot_version"
);