CREATE TABLE IF NOT EXISTS "post_likes" (
	"post_id" integer NOT NULL,
	"ip_hash" text NOT NULL,
	"liked_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "post_likes" ADD CONSTRAINT "post_likes_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null; END $$;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "post_likes_post_ip_uidx" ON "post_likes" USING btree ("post_id","ip_hash");
