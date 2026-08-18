CREATE TABLE "prospects" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"lastname" varchar(120) DEFAULT '' NOT NULL,
	"email" varchar(320) NOT NULL,
	"phone" varchar(40),
	"company_name" varchar(250) DEFAULT '' NOT NULL,
	"message" text DEFAULT '' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by_id" uuid,
	"user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "notification_deliveries" ALTER COLUMN "recipient_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_accepted_by_id_users_id_fk" FOREIGN KEY ("accepted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prospects" ADD CONSTRAINT "prospects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prospects_pending_idx" ON "prospects" USING btree ("created_at") WHERE accepted_at IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "prospects_email_idx" ON "prospects" USING btree ("email");