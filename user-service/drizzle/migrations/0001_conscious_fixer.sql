ALTER TABLE "users_schema"."users" ADD COLUMN "is_guest" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users_schema"."users" ADD COLUMN "guest_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users_schema"."users" ADD COLUMN "token_version" integer DEFAULT 0 NOT NULL;