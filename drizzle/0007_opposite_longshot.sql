CREATE TABLE "tavern_replies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"post_id" uuid NOT NULL,
	"character_id" uuid NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tavern_replies" ADD CONSTRAINT "tavern_replies_post_id_tavern_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."tavern_posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tavern_replies" ADD CONSTRAINT "tavern_replies_character_id_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."characters"("id") ON DELETE no action ON UPDATE no action;