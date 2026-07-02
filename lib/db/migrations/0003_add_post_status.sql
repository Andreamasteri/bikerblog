ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "status" text DEFAULT 'published' NOT NULL;
