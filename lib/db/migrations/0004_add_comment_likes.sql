ALTER TABLE "comments" ADD COLUMN IF NOT EXISTS "like_count" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "comment_likes" (
"comment_id" integer NOT NULL,
"ip_hash" text NOT NULL,
"liked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "comment_likes" ADD CONSTRAINT "comment_likes_comment_id_comments_id_fk" FOREIGN KEY ("comment_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "comment_likes_comment_ip_uidx" ON "comment_likes" USING btree ("comment_id","ip_hash");
