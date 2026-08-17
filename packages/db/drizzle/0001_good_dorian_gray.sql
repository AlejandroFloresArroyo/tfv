CREATE TYPE "public"."credential_purpose" AS ENUM('email_verification', 'password_reset', 'invitation');--> statement-breakpoint
CREATE TYPE "public"."session_revocation" AS ENUM('logout', 'logout_all', 'password_changed', 'account_deactivated', 'reuse_detected', 'expired');--> statement-breakpoint
CREATE TYPE "public"."counterparty_role" AS ENUM('client', 'provider');--> statement-breakpoint
CREATE TYPE "public"."activity_action" AS ENUM('create', 'update', 'delete');--> statement-breakpoint
CREATE TYPE "public"."activity_origin" AS ENUM('web', 'mobile', 'api', 'integration', 'automation', 'system', 'other');--> statement-breakpoint
CREATE TYPE "public"."delivery_channel" AS ENUM('inbox', 'push', 'email');--> statement-breakpoint
CREATE TYPE "public"."delivery_status" AS ENUM('queued', 'sent', 'failed', 'skipped_by_preference');--> statement-breakpoint
CREATE TABLE "login_attempts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"email" varchar(320) NOT NULL,
	"ip_address" varchar(45) NOT NULL,
	"succeeded_at" timestamp with time zone,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "one_time_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"purpose" "credential_purpose" NOT NULL,
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"pending_email" varchar(320),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"chain_id" uuid NOT NULL,
	"refresh_token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revocation_reason" "session_revocation",
	"user_agent" text,
	"ip_address" varchar(45),
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "company_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"label" varchar(120) DEFAULT '' NOT NULL,
	"street" varchar(200) DEFAULT '' NOT NULL,
	"number" varchar(32) DEFAULT '' NOT NULL,
	"colony" varchar(120) DEFAULT '' NOT NULL,
	"city" varchar(120) DEFAULT '' NOT NULL,
	"state" varchar(120) DEFAULT '' NOT NULL,
	"country" varchar(120) DEFAULT 'México' NOT NULL,
	"country_code" varchar(2) DEFAULT 'MX' NOT NULL,
	"postal_code" varchar(16) DEFAULT '' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"label" varchar(120) DEFAULT '' NOT NULL,
	"street" varchar(200) DEFAULT '' NOT NULL,
	"number" varchar(32) DEFAULT '' NOT NULL,
	"colony" varchar(120) DEFAULT '' NOT NULL,
	"city" varchar(120) DEFAULT '' NOT NULL,
	"state" varchar(120) DEFAULT '' NOT NULL,
	"country" varchar(120) DEFAULT 'México' NOT NULL,
	"country_code" varchar(2) DEFAULT 'MX' NOT NULL,
	"postal_code" varchar(16) DEFAULT '' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "global_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"parent_id" uuid,
	"service_id" uuid,
	"keyname" varchar(64),
	"name" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"slug" varchar(180),
	"color" varchar(16),
	"icon" varchar(64),
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "counterparties" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"role" "counterparty_role" NOT NULL,
	"alias" varchar(160) NOT NULL,
	"user_id" uuid,
	"counterparty_company_id" uuid,
	"snapshot" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "company_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"service_id" uuid,
	"action" "activity_action" NOT NULL,
	"entity" varchar(80) NOT NULL,
	"entity_id" uuid,
	"entity_label" varchar(200) DEFAULT '' NOT NULL,
	"title" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"url" text DEFAULT '/' NOT NULL,
	"origin" "activity_origin" DEFAULT 'web' NOT NULL,
	"permission" varchar(120),
	"performed_by_id" uuid,
	"performed_as_platform_admin" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"activity_id" uuid,
	"recipient_id" uuid NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"kind" varchar(80) NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"status" "delivery_status" DEFAULT 'queued' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"category" varchar(80) NOT NULL,
	"channel" "delivery_channel" NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "push_devices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"token" text NOT NULL,
	"user_agent" text,
	"last_seen_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "one_time_credentials" ADD CONSTRAINT "one_time_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_addresses" ADD CONSTRAINT "company_addresses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_categories" ADD CONSTRAINT "global_categories_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_categories" ADD CONSTRAINT "global_categories_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "global_categories" ADD CONSTRAINT "global_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."global_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_counterparty_company_id_companies_id_fk" FOREIGN KEY ("counterparty_company_id") REFERENCES "public"."companies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "counterparties" ADD CONSTRAINT "counterparties_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_activities" ADD CONSTRAINT "company_activities_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_activities" ADD CONSTRAINT "company_activities_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_activities" ADD CONSTRAINT "company_activities_performed_by_id_users_id_fk" FOREIGN KEY ("performed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_activity_id_company_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."company_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_recipient_id_users_id_fk" FOREIGN KEY ("recipient_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_devices" ADD CONSTRAINT "push_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "login_attempts_email_idx" ON "login_attempts" USING btree ("email","attempted_at");--> statement-breakpoint
CREATE INDEX "login_attempts_ip_idx" ON "login_attempts" USING btree ("ip_address","attempted_at");--> statement-breakpoint
CREATE UNIQUE INDEX "one_time_credentials_hash_unique" ON "one_time_credentials" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "one_time_credentials_user_idx" ON "one_time_credentials" USING btree ("user_id","purpose");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_refresh_hash_unique" ON "sessions" USING btree ("refresh_token_hash");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id","revoked_at");--> statement-breakpoint
CREATE INDEX "sessions_chain_idx" ON "sessions" USING btree ("chain_id");--> statement-breakpoint
CREATE INDEX "sessions_expiry_idx" ON "sessions" USING btree ("expires_at") WHERE revoked_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "company_addresses_primary_unique" ON "company_addresses" USING btree ("company_id") WHERE is_primary = true;--> statement-breakpoint
CREATE INDEX "company_addresses_company_idx" ON "company_addresses" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_addresses_primary_unique" ON "user_addresses" USING btree ("user_id") WHERE is_primary = true;--> statement-breakpoint
CREATE INDEX "user_addresses_user_idx" ON "user_addresses" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "global_categories_slug_unique" ON "global_categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "global_categories_keyname_unique" ON "global_categories" USING btree ("keyname");--> statement-breakpoint
CREATE INDEX "global_categories_parent_idx" ON "global_categories" USING btree ("parent_id","name");--> statement-breakpoint
CREATE INDEX "global_categories_service_idx" ON "global_categories" USING btree ("service_id");--> statement-breakpoint
CREATE UNIQUE INDEX "counterparties_company_pair_unique" ON "counterparties" USING btree ("company_id","role","counterparty_company_id") WHERE counterparty_company_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "counterparties_user_pair_unique" ON "counterparties" USING btree ("company_id","role","user_id") WHERE user_id IS NOT NULL AND counterparty_company_id IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "counterparties_company_idx" ON "counterparties" USING btree ("company_id","role","alias");--> statement-breakpoint
CREATE INDEX "company_activities_company_idx" ON "company_activities" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "company_activities_actor_idx" ON "company_activities" USING btree ("performed_by_id","created_at");--> statement-breakpoint
CREATE INDEX "company_activities_service_idx" ON "company_activities" USING btree ("company_id","service_id","created_at");--> statement-breakpoint
CREATE INDEX "company_activities_entity_idx" ON "company_activities" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "notification_deliveries_pending_idx" ON "notification_deliveries" USING btree ("created_at") WHERE status = 'queued';--> statement-breakpoint
CREATE INDEX "notification_deliveries_recipient_idx" ON "notification_deliveries" USING btree ("recipient_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_preferences_unique" ON "notification_preferences" USING btree ("user_id","category","channel");--> statement-breakpoint
CREATE UNIQUE INDEX "push_devices_token_unique" ON "push_devices" USING btree ("token");--> statement-breakpoint
CREATE INDEX "push_devices_user_idx" ON "push_devices" USING btree ("user_id");