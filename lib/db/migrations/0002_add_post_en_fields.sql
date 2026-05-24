ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "title_en" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "excerpt_en" text;--> statement-breakpoint
ALTER TABLE "posts" ADD COLUMN IF NOT EXISTS "body_en" text;
