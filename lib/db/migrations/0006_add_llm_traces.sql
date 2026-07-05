CREATE TABLE IF NOT EXISTS "llm_traces" (
"id" serial PRIMARY KEY NOT NULL,
"agent" text NOT NULL,
"surface" text NOT NULL,
"conversation_id" text,
"turn_number" integer,
"tools_used" text[] DEFAULT '{}' NOT NULL,
"latency_ms" integer NOT NULL,
"outcome" text NOT NULL,
"error_message" text,
"input_excerpt" text NOT NULL,
"output_excerpt" text,
"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
