CREATE SCHEMA IF NOT EXISTS "users_schema";
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."permission_level" AS ENUM('read', 'read-write');

EXCEPTION WHEN duplicate_object THEN null;

END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users_schema"."document_permissions" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "document_id" uuid NOT NULL,
    "user_id" uuid NOT NULL,
    "permission" "permission_level" DEFAULT 'read' NOT NULL,
    "granted_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users_schema"."documents" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "title" varchar(255) NOT NULL,
    "owner_id" uuid NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users_schema"."users" (
    "id" uuid PRIMARY KEY DEFAULT gen_random_uuid () NOT NULL,
    "email" varchar(255) NOT NULL,
    "password_hash" varchar(255) NOT NULL,
    "display_name" varchar(100) NOT NULL,
    "created_at" timestamp with time zone DEFAULT now(),
    "updated_at" timestamp with time zone DEFAULT now(),
    CONSTRAINT "users_email_unique" UNIQUE ("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_schema"."document_permissions" ADD CONSTRAINT "document_permissions_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "users_schema"."documents"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_schema"."document_permissions" ADD CONSTRAINT "document_permissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users_schema"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users_schema"."documents" ADD CONSTRAINT "documents_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "users_schema"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "unique_doc_user" ON "users_schema"."document_permissions" USING btree ("document_id", "user_id");