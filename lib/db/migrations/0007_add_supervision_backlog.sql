CREATE TABLE IF NOT EXISTS "supervision_backlog" (
"id" serial PRIMARY KEY NOT NULL,
"trace_id" integer NOT NULL,
"agent" text NOT NULL,
"reason" text NOT NULL,
"category" text,
"classification" text,
"severity" text,
"status" text DEFAULT 'open' NOT NULL,
"ares_notes" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL,
"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "supervision_backlog_trace_id_unique" ON "supervision_backlog" ("trace_id");
