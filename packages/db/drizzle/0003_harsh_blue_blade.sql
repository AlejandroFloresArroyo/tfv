ALTER TABLE "sessions" ADD COLUMN "access_token_hash" varchar(128) NOT NULL;--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "access_expires_at" timestamp with time zone NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_access_hash_unique" ON "sessions" USING btree ("access_token_hash");