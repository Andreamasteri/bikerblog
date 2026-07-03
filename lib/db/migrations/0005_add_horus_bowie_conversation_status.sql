CREATE TABLE IF NOT EXISTS "horus_bowie_conversations" (
"id" serial PRIMARY KEY NOT NULL,
"topic" text NOT NULL,
"transcript" jsonb NOT NULL,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"status" text DEFAULT 'complete' NOT NULL
);
--> statement-breakpoint
ALTER TABLE "horus_bowie_conversations" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'complete' NOT NULL;
