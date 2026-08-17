CREATE TYPE "public"."billing_interval" AS ENUM('day', 'week', 'month', 'year');--> statement-breakpoint
CREATE TYPE "public"."merchant_payment_method" AS ENUM('card', 'oxxo', 'spei', 'bank_transfer');--> statement-breakpoint
CREATE TYPE "public"."merchant_payment_status" AS ENUM('created', 'requires_action', 'processing', 'paid', 'failed', 'refunded', 'disputed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."merchant_status" AS ENUM('pending', 'limited', 'active', 'inactive');--> statement-breakpoint
CREATE TYPE "public"."merchant_verification" AS ENUM('pending', 'verified', 'disabled');--> statement-breakpoint
CREATE TYPE "public"."subscription_status" AS ENUM('trialing', 'active', 'past_due', 'incomplete', 'incomplete_expired', 'unpaid', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."length_unit" AS ENUM('cm', 'm', 'in', 'ft');--> statement-breakpoint
CREATE TYPE "public"."mass_unit" AS ENUM('g', 'kg', 'lb', 'oz');--> statement-breakpoint
CREATE TYPE "public"."measurement_kind" AS ENUM('box', 'envelope', 'clothing', 'accessory', 'other');--> statement-breakpoint
CREATE TYPE "public"."product_relation" AS ENUM('variant', 'accessory');--> statement-breakpoint
CREATE TYPE "public"."stock_event_reason" AS ENUM('manual', 'quote_reservation', 'quote_release', 'quote_status', 'order', 'storefront_sale', 'rental_return', 'created');--> statement-breakpoint
CREATE TYPE "public"."stock_status" AS ENUM('available', 'in_quote', 'in_order', 'rented', 'sold', 'lost', 'damaged', 'robbed', 'incomplete', 'modified', 'expense');--> statement-breakpoint
CREATE TYPE "public"."storage_kind" AS ENUM('floor', 'area', 'aisle', 'section', 'bay', 'rack', 'shelf', 'pallet', 'box', 'bin');--> statement-breakpoint
CREATE TYPE "public"."recording_kind" AS ENUM('record', 're_record');--> statement-breakpoint
CREATE TYPE "public"."recording_status" AS ENUM('draft', 'ongoing', 'completed');--> statement-breakpoint
CREATE TYPE "public"."script_sync_status" AS ENUM('not_extracted', 'queued', 'running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "public"."workflow_activity_status" AS ENUM('incomplete', 'completed');--> statement-breakpoint
CREATE TYPE "public"."production_delivery_status" AS ENUM('pending', 'in_progress', 'completed', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."production_item_status" AS ENUM('available', 'stored', 'delivered', 'returned', 'damaged', 'incomplete', 'lost', 'robbed');--> statement-breakpoint
CREATE TYPE "public"."purchase_order_status" AS ENUM('open', 'settled', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."shopping_kind" AS ENUM('shopping', 'expense', 'payment', 'rent', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."shopping_method" AS ENUM('cash', 'card', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."task_status" AS ENUM('pending', 'in_progress', 'completed', 'incomplete');--> statement-breakpoint
CREATE TYPE "public"."workflow_status" AS ENUM('pending', 'in_progress', 'rescheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."cash_session_status" AS ENUM('active', 'closed');--> statement-breakpoint
CREATE TYPE "public"."pixit_inventory_kind" AS ENUM('board_size', 'sheet', 'brick');--> statement-breakpoint
CREATE TYPE "public"."sale_payment_method" AS ENUM('cash', 'card', 'transfer', 'mixed');--> statement-breakpoint
CREATE TYPE "public"."buyer_order_status" AS ENUM('paid', 'processing', 'completed', 'canceled', 'refunded');--> statement-breakpoint
CREATE TYPE "public"."checkout_status" AS ENUM('pending', 'completed', 'canceled', 'expired');--> statement-breakpoint
CREATE TYPE "public"."payment_status" AS ENUM('created', 'processing', 'succeeded', 'failed', 'refunded', 'disputed');--> statement-breakpoint
CREATE TYPE "public"."shipment_status" AS ENUM('pending', 'shipped', 'in_transit', 'delivered', 'returned', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."shipping_mode" AS ENUM('local', 'national', 'international', 'pickup');--> statement-breakpoint
CREATE TYPE "public"."chat_side" AS ENUM('client', 'provider', 'system');--> statement-breakpoint
CREATE TYPE "public"."warehouse_order_origin" AS ENUM('production', 'storefront');--> statement-breakpoint
CREATE TYPE "public"."warehouse_order_status" AS ENUM('pending', 'accepted', 'delivered', 'finished', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."quote_payment_method" AS ENUM('card', 'cash', 'transfer');--> statement-breakpoint
CREATE TYPE "public"."quote_status" AS ENUM('pre_quote', 'pending', 'in_progress', 'in_rent', 'completed', 'sold', 'canceled');--> statement-breakpoint
CREATE TYPE "public"."rent_frequency" AS ENUM('daily', 'weekly', 'monthly');--> statement-breakpoint
CREATE TYPE "public"."round_direction" AS ENUM('up', 'down');--> statement-breakpoint
CREATE TYPE "public"."trade_type" AS ENUM('rent', 'sale');--> statement-breakpoint
CREATE TABLE "company_subscriptions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"plan_id" uuid NOT NULL,
	"subscribed_by_id" uuid,
	"status" "subscription_status" NOT NULL,
	"cancel_at_period_end" boolean DEFAULT false NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"interval" "billing_interval" NOT NULL,
	"interval_count" integer DEFAULT 1 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"grace_period_ends_at" timestamp with time zone,
	"external_subscription_id" varchar(120),
	"external_customer_id" varchar(120),
	"external_price_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"merchant_profile_id" uuid,
	"buyer_id" uuid,
	"gross_amount" numeric(14, 2) NOT NULL,
	"platform_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"platform_fee_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"method" "merchant_payment_method",
	"status" "merchant_payment_status" DEFAULT 'created' NOT NULL,
	"external_payment_intent_id" varchar(120),
	"receipt_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "merchant_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"alias" varchar(160) NOT NULL,
	"address_id" uuid,
	"business" jsonb NOT NULL,
	"bank" jsonb NOT NULL,
	"representative" jsonb NOT NULL,
	"status" "merchant_status" DEFAULT 'pending' NOT NULL,
	"verification_status" "merchant_verification" DEFAULT 'pending' NOT NULL,
	"can_accept_charges" boolean DEFAULT false NOT NULL,
	"can_receive_payouts" boolean DEFAULT false NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"external_account_id" varchar(120),
	"terms_accepted_at" timestamp with time zone,
	"terms_accepted_ip" varchar(45),
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "subscription_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"subscription_id" uuid,
	"amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"seats" integer DEFAULT 1 NOT NULL,
	"period_start" timestamp with time zone,
	"period_end" timestamp with time zone,
	"succeeded" boolean NOT NULL,
	"external_invoice_id" varchar(120),
	"external_payment_intent_id" varchar(120),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"tier" integer NOT NULL,
	"title" varchar(160) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"is_individual" boolean DEFAULT false NOT NULL,
	"is_recommended" boolean DEFAULT false NOT NULL,
	"external_product_id" varchar(120),
	"features" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"parent_id" uuid,
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
CREATE TABLE "warehouse_measurements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"kind" "measurement_kind" DEFAULT 'box' NOT NULL,
	"price_difference" numeric(14, 2) DEFAULT '0' NOT NULL,
	"dimensions" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"length_unit" "length_unit" DEFAULT 'cm' NOT NULL,
	"mass_unit" "mass_unit" DEFAULT 'g' NOT NULL,
	"clothing" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_price_lists" (
	"id" uuid PRIMARY KEY NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_product_prices" (
	"id" uuid PRIMARY KEY NOT NULL,
	"price_list_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sale" numeric(14, 2) DEFAULT '0' NOT NULL,
	"rent" jsonb DEFAULT '{"isFixed":false}'::jsonb NOT NULL,
	"penalty" jsonb DEFAULT '{"isFixed":false}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"warehouse_id" uuid NOT NULL,
	"parent_id" uuid,
	"relation_to_parent" "product_relation",
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"internal_code" varchar(80),
	"code" varchar(64) NOT NULL,
	"cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"uses_price_lists" boolean DEFAULT false NOT NULL,
	"available_for_sale" boolean DEFAULT false NOT NULL,
	"available_for_rent" boolean DEFAULT false NOT NULL,
	"storage_id" uuid,
	"category_id" uuid,
	"global_category_id" uuid,
	"responsible_id" uuid,
	"slug" varchar(280),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stock_unit_id" uuid NOT NULL,
	"from_status" "stock_status",
	"to_status" "stock_status" NOT NULL,
	"reason" "stock_event_reason" NOT NULL,
	"actor_id" uuid,
	"cause_id" uuid,
	"note" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock_units" (
	"id" uuid PRIMARY KEY NOT NULL,
	"measurement_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"status" "stock_status" DEFAULT 'available' NOT NULL,
	"created_by_reservation" boolean DEFAULT false NOT NULL,
	"created_by_quote_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_storages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"parent_id" uuid,
	"kind" "storage_kind" DEFAULT 'box' NOT NULL,
	"code" varchar(32) NOT NULL,
	"name" varchar(200) NOT NULL,
	"color" varchar(16),
	"icon" varchar(64),
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouses" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_upload_id" uuid,
	"slug" varchar(220),
	"is_published" boolean DEFAULT false NOT NULL,
	"priority" numeric(7, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"parent_id" uuid,
	"role_id" uuid,
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
CREATE TABLE "production_chapters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"script_id" uuid,
	"name" varchar(250) NOT NULL,
	"synopsis" text DEFAULT '' NOT NULL,
	"index" integer NOT NULL,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_characters" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_upload_id" uuid,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_continuities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recording_id" uuid NOT NULL,
	"character_id" uuid,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_recording_notes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"recording_id" uuid NOT NULL,
	"body" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_recordings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"name" varchar(250) NOT NULL,
	"kind" "recording_kind" DEFAULT 'record' NOT NULL,
	"status" "recording_status" DEFAULT 'draft' NOT NULL,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_scenes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"chapter_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"synopsis" text DEFAULT '' NOT NULL,
	"index" integer NOT NULL,
	"synopsis_edited_at" timestamp with time zone,
	"missing_from_last_sync" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_scripts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"index" integer DEFAULT 0 NOT NULL,
	"document_upload_id" uuid,
	"responsible_id" uuid,
	"sync_status" "script_sync_status" DEFAULT 'not_extracted' NOT NULL,
	"sync_error" text,
	"synced_at" timestamp with time zone,
	"scenes_without_body" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_videos" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"category_id" uuid,
	"name" varchar(250) NOT NULL,
	"video_upload_id" uuid,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "productions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"company_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_upload_id" uuid,
	"starts_on" timestamp with time zone,
	"ends_on" timestamp with time zone,
	"slug" varchar(280),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_anchors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"category_id" uuid,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_attachments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid,
	"activity_id" uuid,
	"anchor_id" uuid,
	"shopping_id" uuid,
	"upload_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_comments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" uuid,
	"task_id" uuid,
	"body" text NOT NULL,
	"author_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_deliveries" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "production_delivery_status" DEFAULT 'pending' NOT NULL,
	"responsible_id" uuid,
	"signed_by_id" uuid,
	"signature_upload_id" uuid,
	"receiver_name" varchar(200),
	"receiver_signature_upload_id" uuid,
	"signed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_delivery_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"delivery_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"is_verified" boolean DEFAULT false NOT NULL,
	"verified_by_id" uuid,
	"verified_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_item_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"item_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"production_id" uuid NOT NULL,
	"category_id" uuid,
	"shopping_id" uuid,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"code" varchar(64) NOT NULL,
	"status" "production_item_status" DEFAULT 'available' NOT NULL,
	"is_inventoriable" boolean DEFAULT true NOT NULL,
	"slug" varchar(280),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_props" (
	"id" uuid PRIMARY KEY NOT NULL,
	"continuity_id" uuid NOT NULL,
	"item_id" uuid,
	"video_id" uuid,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_props_item_xor_video" CHECK ((item_id IS NOT NULL AND video_id IS NULL) OR (item_id IS NULL AND video_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "production_purchase_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"measurement_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_purchase_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(250) DEFAULT '' NOT NULL,
	"type" varchar(8) DEFAULT 'sale' NOT NULL,
	"status" "purchase_order_status" DEFAULT 'open' NOT NULL,
	"category_id" uuid,
	"delivery_address_id" uuid,
	"responsible_id" uuid,
	"canceled_at" timestamp with time zone,
	"canceled_by_id" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_set_items" (
	"id" uuid PRIMARY KEY NOT NULL,
	"set_id" uuid NOT NULL,
	"item_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "production_sets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_upload_id" uuid,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_shoppings" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"category_id" uuid,
	"provider_id" uuid,
	"warehouse_order_id" uuid,
	"name" varchar(250) NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"kind" "shopping_kind" DEFAULT 'shopping' NOT NULL,
	"method" "shopping_method" DEFAULT 'cash' NOT NULL,
	"card_last4" varchar(4),
	"is_deductible" boolean DEFAULT false NOT NULL,
	"occurred_on" timestamp with time zone,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_task_activities" (
	"id" uuid PRIMARY KEY NOT NULL,
	"task_id" uuid NOT NULL,
	"title" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "workflow_activity_status" DEFAULT 'incomplete' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"responsible_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_tasks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workflow_id" uuid NOT NULL,
	"category_id" uuid,
	"character_id" uuid,
	"title" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"status" "task_status" DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"responsible_id" uuid,
	"created_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "production_workflows" (
	"id" uuid PRIMARY KEY NOT NULL,
	"production_id" uuid NOT NULL,
	"scene_id" uuid,
	"code" varchar(64) NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"status" "workflow_status" DEFAULT 'pending' NOT NULL,
	"scheduled_for" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"responsible_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pixit_board_sizes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"board_id" uuid NOT NULL,
	"name" varchar(160) NOT NULL,
	"abbreviation" varchar(32),
	"description" text DEFAULT '' NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"sheets_x" integer NOT NULL,
	"sheets_y" integer NOT NULL,
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pixit_board_sizes_positive" CHECK (sheets_x >= 1 AND sheets_y >= 1)
);
--> statement-breakpoint
CREATE TABLE "pixit_boards" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(200) NOT NULL,
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pixit_cash_sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"responsible_id" uuid,
	"status" "cash_session_status" DEFAULT 'active' NOT NULL,
	"opening_float" numeric(14, 2) DEFAULT '0' NOT NULL,
	"counted_cash" numeric(14, 2),
	"variance" numeric(14, 2),
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pixit_colors" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"hex" varchar(7) NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pixit_colors_hex_format" CHECK (hex ~ '^#[0-9A-Fa-f]{6}$')
);
--> statement-breakpoint
CREATE TABLE "pixit_inventory_definitions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" "pixit_inventory_kind" NOT NULL,
	"catalog_ref_id" uuid NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"low_stock_threshold" integer,
	"image_upload_id" uuid,
	"slug" varchar(220),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pixit_inventory_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"definition_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	"pieces" integer,
	"sale_id" uuid,
	"parent_movement_id" uuid,
	"position" integer,
	"image_upload_id" uuid,
	"compensates_movement_id" uuid,
	"authorized_negative" boolean DEFAULT false NOT NULL,
	"actor_id" uuid,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pixit_inventory_movements_signs" CHECK (pieces IS NULL OR sign(quantity) = sign(pieces) OR quantity = 0)
);
--> statement-breakpoint
CREATE TABLE "pixit_product_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pixit_products" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"company_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"stock" integer DEFAULT 0 NOT NULL,
	"discount_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"has_discount" boolean DEFAULT false NOT NULL,
	"slug" varchar(280),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pixit_rooms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"image_upload_id" uuid,
	"position_x" numeric(7, 4) DEFAULT '50' NOT NULL,
	"position_y" numeric(7, 4) DEFAULT '50' NOT NULL,
	"scale" numeric(7, 4) DEFAULT '1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "pixit_sales" (
	"id" uuid PRIMARY KEY NOT NULL,
	"store_id" uuid NOT NULL,
	"session_id" uuid,
	"responsible_id" uuid,
	"code" varchar(64) NOT NULL,
	"method" "sale_payment_method" DEFAULT 'cash' NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"subtotal" numeric(14, 2) DEFAULT '0' NOT NULL,
	"discount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"tax" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) DEFAULT '0' NOT NULL,
	"received" numeric(14, 2),
	"change" numeric(14, 2),
	"voided_at" timestamp with time zone,
	"voided_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pixit_sheets" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(160) NOT NULL,
	"price" numeric(14, 2) DEFAULT '0' NOT NULL,
	"bricks_x" integer NOT NULL,
	"bricks_y" integer NOT NULL,
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pixit_sheets_positive" CHECK (bricks_x >= 1 AND bricks_y >= 1)
);
--> statement-breakpoint
CREATE TABLE "pixit_stores" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"address_id" uuid,
	"image_upload_id" uuid,
	"pieces_per_bag" integer DEFAULT 6 NOT NULL,
	"low_stock_threshold" integer DEFAULT 10 NOT NULL,
	"slug" varchar(220),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "pixit_stores_pieces_positive" CHECK (pieces_per_bag >= 1)
);
--> statement-breakpoint
CREATE TABLE "pixit_terms" (
	"id" uuid PRIMARY KEY NOT NULL,
	"language_code" varchar(8) NOT NULL,
	"name" varchar(160) NOT NULL,
	"title" varchar(200) DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"flag_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "website_customizations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"website_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"color" varchar(16) DEFAULT '#000000' NOT NULL,
	"banner_upload_id" uuid,
	"is_primary" boolean DEFAULT false NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"slug" varchar(200) NOT NULL,
	"is_published" boolean DEFAULT false NOT NULL,
	"category_id" uuid,
	"warehouse_id" uuid,
	"pixit_store_id" uuid,
	"logo_upload_id" uuid,
	"icon_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "location_images" (
	"id" uuid PRIMARY KEY NOT NULL,
	"location_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_networks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"company_id" uuid NOT NULL,
	"name" varchar(200) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_upload_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "location_tags" (
	"id" uuid PRIMARY KEY NOT NULL,
	"location_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"facet" varchar(32) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "locations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"legacy_id" char(24),
	"network_id" uuid NOT NULL,
	"name" varchar(250) NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"address" text DEFAULT '' NOT NULL,
	"latitude" numeric(10, 7),
	"longitude" numeric(10, 7),
	"capacity" integer DEFAULT 1 NOT NULL,
	"area_size" numeric(10, 2),
	"category_id" uuid,
	"type_id" uuid,
	"amenities" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"availability" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rates" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"allowed_note" text,
	"denied_note" text,
	"interiors_note" text,
	"exteriors_note" text,
	"responsible_id" uuid,
	"slug" varchar(280),
	"is_published" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "buyer_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"line" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "buyer_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_id" uuid,
	"buyer_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"payment_id" uuid,
	"shipment_id" uuid,
	"reference" varchar(64) NOT NULL,
	"type" varchar(8) DEFAULT 'sale' NOT NULL,
	"status" "buyer_order_status" DEFAULT 'paid' NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"shipping_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"platform_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "checkouts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"website_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"buyer_id" uuid NOT NULL,
	"merchant_profile_id" uuid,
	"type" varchar(8) DEFAULT 'sale' NOT NULL,
	"status" "checkout_status" DEFAULT 'pending' NOT NULL,
	"lines" jsonb NOT NULL,
	"subtotal" numeric(14, 2) NOT NULL,
	"platform_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"platform_fee_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"shipping_cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"shipping_mode" "shipping_mode" NOT NULL,
	"shipping_breakdown" jsonb,
	"ship_from_address_id" uuid,
	"ship_to_address_id" uuid,
	"external_session_id" varchar(160),
	"checkout_url" text,
	"expires_at" timestamp with time zone,
	"fulfilled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_events" (
	"id" uuid PRIMARY KEY NOT NULL,
	"external_event_id" varchar(160) NOT NULL,
	"type" varchar(120) NOT NULL,
	"payload" jsonb NOT NULL,
	"signature_verified" boolean NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"attempts" integer DEFAULT 0 NOT NULL,
	"last_error" text
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"checkout_id" uuid,
	"buyer_id" uuid,
	"gross_amount" numeric(14, 2) NOT NULL,
	"platform_fee" numeric(14, 2) DEFAULT '0' NOT NULL,
	"platform_fee_rate" numeric(7, 4) DEFAULT '0' NOT NULL,
	"net_amount" numeric(14, 2) NOT NULL,
	"currency" varchar(3) DEFAULT 'MXN' NOT NULL,
	"method" varchar(40),
	"status" "payment_status" DEFAULT 'created' NOT NULL,
	"external_payment_intent_id" varchar(160),
	"external_charge_id" varchar(160),
	"receipt_url" text,
	"refunded_amount" numeric(14, 2) DEFAULT '0' NOT NULL,
	"refunded_at" timestamp with time zone,
	"disputed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "shipments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"mode" "shipping_mode" NOT NULL,
	"cost" numeric(14, 2) DEFAULT '0' NOT NULL,
	"status" "shipment_status" DEFAULT 'pending' NOT NULL,
	"carrier" varchar(60) DEFAULT 'manual' NOT NULL,
	"tracking_number" varchar(120),
	"estimated_delivery_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"from_address_id" uuid,
	"to_address_id" uuid,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_order_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"measurement_id" uuid NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_order_messages" (
	"id" uuid PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"side" "chat_side" NOT NULL,
	"author_id" uuid,
	"body" text NOT NULL,
	"reply_to_id" uuid,
	"read_by_client_at" timestamp with time zone,
	"read_by_provider_at" timestamp with time zone,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_orders" (
	"id" uuid PRIMARY KEY NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"code" varchar(64) NOT NULL,
	"name" varchar(250) DEFAULT '' NOT NULL,
	"observations" text DEFAULT '' NOT NULL,
	"origin" "warehouse_order_origin" NOT NULL,
	"type" "trade_type" DEFAULT 'sale' NOT NULL,
	"status" "warehouse_order_status" DEFAULT 'pending' NOT NULL,
	"priority" numeric(4, 2) GENERATED ALWAYS AS ((case status
            when 'pending' then 0.80
            when 'accepted' then 0.70
            when 'delivered' then 0.60
            when 'finished' then 0.50
            else 0.40
          end) + (case when quote_id is not null then 0.05 else 0 end)) STORED,
	"quote_id" uuid,
	"purchase_order_id" uuid,
	"buyer_order_id" uuid,
	"client_id" uuid,
	"provider_id" uuid,
	"canceled_at" timestamp with time zone,
	"canceled_by_id" uuid,
	"cancel_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_quote_lines" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"measurement_id" uuid NOT NULL,
	"product_price_id" uuid,
	"frequency" "rent_frequency" DEFAULT 'weekly' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"position_product" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_quote_payment_vouchers" (
	"id" uuid PRIMARY KEY NOT NULL,
	"payment_id" uuid NOT NULL,
	"upload_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_quote_payments" (
	"id" uuid PRIMARY KEY NOT NULL,
	"quote_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"method" "quote_payment_method" DEFAULT 'cash' NOT NULL,
	"description" text,
	"paid_by_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warehouse_quotes" (
	"id" uuid PRIMARY KEY NOT NULL,
	"warehouse_id" uuid NOT NULL,
	"order_id" uuid,
	"client_id" uuid,
	"responsible_id" uuid,
	"code" varchar(64) NOT NULL,
	"folio" varchar(64),
	"name" varchar(250) DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"type" "trade_type" DEFAULT 'sale' NOT NULL,
	"status" "quote_status" DEFAULT 'pending' NOT NULL,
	"priority" numeric(4, 2) GENERATED ALWAYS AS ((case status
            when 'pre_quote' then 0.90
            when 'pending' then 0.80
            when 'in_progress' then 0.70
            when 'in_rent' then 0.60
            when 'completed' then 0.50
            when 'sold' then 0.40
            else 0.30
          end) + (case when order_id is not null then 0.05 else 0 end)) STORED,
	"starts_on" timestamp with time zone,
	"ends_on" timestamp with time zone,
	"round_days" boolean DEFAULT false NOT NULL,
	"round_direction" "round_direction" DEFAULT 'up' NOT NULL,
	"client_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"seller_contacts" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payment_terms" jsonb,
	"taxes" jsonb,
	"computed" jsonb,
	"computed_at" timestamp with time zone,
	"alert" text,
	"message" text,
	"terms" text,
	"observations" text,
	"client_signature_id" uuid,
	"responsible_signature_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "warehouse_stock_reservations" (
	"id" uuid PRIMARY KEY NOT NULL,
	"stock_unit_id" uuid NOT NULL,
	"quote_line_id" uuid,
	"quote_id" uuid,
	"checkout_id" uuid,
	"expires_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_subscriptions" ADD CONSTRAINT "company_subscriptions_subscribed_by_id_users_id_fk" FOREIGN KEY ("subscribed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payments" ADD CONSTRAINT "merchant_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payments" ADD CONSTRAINT "merchant_payments_merchant_profile_id_merchant_profiles_id_fk" FOREIGN KEY ("merchant_profile_id") REFERENCES "public"."merchant_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_payments" ADD CONSTRAINT "merchant_payments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_profiles" ADD CONSTRAINT "merchant_profiles_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "merchant_profiles" ADD CONSTRAINT "merchant_profiles_address_id_company_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."company_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_company_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."company_subscriptions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_categories" ADD CONSTRAINT "warehouse_categories_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_categories" ADD CONSTRAINT "warehouse_categories_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_categories" ADD CONSTRAINT "warehouse_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouse_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_measurements" ADD CONSTRAINT "warehouse_measurements_product_id_warehouse_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."warehouse_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_price_lists" ADD CONSTRAINT "warehouse_price_lists_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_product_prices" ADD CONSTRAINT "warehouse_product_prices_price_list_id_warehouse_price_lists_id_fk" FOREIGN KEY ("price_list_id") REFERENCES "public"."warehouse_price_lists"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_product_prices" ADD CONSTRAINT "warehouse_product_prices_product_id_warehouse_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."warehouse_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD CONSTRAINT "warehouse_products_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD CONSTRAINT "warehouse_products_storage_id_warehouse_storages_id_fk" FOREIGN KEY ("storage_id") REFERENCES "public"."warehouse_storages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD CONSTRAINT "warehouse_products_category_id_warehouse_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."warehouse_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD CONSTRAINT "warehouse_products_global_category_id_global_categories_id_fk" FOREIGN KEY ("global_category_id") REFERENCES "public"."global_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD CONSTRAINT "warehouse_products_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD CONSTRAINT "warehouse_products_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouse_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_events" ADD CONSTRAINT "warehouse_stock_events_stock_unit_id_warehouse_stock_units_id_fk" FOREIGN KEY ("stock_unit_id") REFERENCES "public"."warehouse_stock_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_events" ADD CONSTRAINT "warehouse_stock_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_units" ADD CONSTRAINT "warehouse_stock_units_measurement_id_warehouse_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."warehouse_measurements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_storages" ADD CONSTRAINT "warehouse_storages_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_storages" ADD CONSTRAINT "warehouse_storages_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_storages" ADD CONSTRAINT "warehouse_storages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."warehouse_storages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_categories" ADD CONSTRAINT "production_categories_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_categories" ADD CONSTRAINT "production_categories_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "public"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_categories" ADD CONSTRAINT "production_categories_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_categories" ADD CONSTRAINT "production_categories_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."production_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_chapters" ADD CONSTRAINT "production_chapters_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_chapters" ADD CONSTRAINT "production_chapters_script_id_production_scripts_id_fk" FOREIGN KEY ("script_id") REFERENCES "public"."production_scripts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_chapters" ADD CONSTRAINT "production_chapters_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_characters" ADD CONSTRAINT "production_characters_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_characters" ADD CONSTRAINT "production_characters_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_characters" ADD CONSTRAINT "production_characters_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_continuities" ADD CONSTRAINT "production_continuities_recording_id_production_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."production_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_continuities" ADD CONSTRAINT "production_continuities_character_id_production_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."production_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_continuities" ADD CONSTRAINT "production_continuities_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recording_notes" ADD CONSTRAINT "production_recording_notes_recording_id_production_recordings_id_fk" FOREIGN KEY ("recording_id") REFERENCES "public"."production_recordings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recording_notes" ADD CONSTRAINT "production_recording_notes_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recordings" ADD CONSTRAINT "production_recordings_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recordings" ADD CONSTRAINT "production_recordings_scene_id_production_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."production_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_recordings" ADD CONSTRAINT "production_recordings_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_scenes" ADD CONSTRAINT "production_scenes_chapter_id_production_chapters_id_fk" FOREIGN KEY ("chapter_id") REFERENCES "public"."production_chapters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_scripts" ADD CONSTRAINT "production_scripts_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_scripts" ADD CONSTRAINT "production_scripts_document_upload_id_uploads_id_fk" FOREIGN KEY ("document_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_scripts" ADD CONSTRAINT "production_scripts_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_videos" ADD CONSTRAINT "production_videos_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_videos" ADD CONSTRAINT "production_videos_category_id_production_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."production_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_videos" ADD CONSTRAINT "production_videos_video_upload_id_uploads_id_fk" FOREIGN KEY ("video_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_videos" ADD CONSTRAINT "production_videos_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "productions" ADD CONSTRAINT "productions_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_anchors" ADD CONSTRAINT "production_anchors_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_anchors" ADD CONSTRAINT "production_anchors_category_id_production_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."production_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_anchors" ADD CONSTRAINT "production_anchors_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachments" ADD CONSTRAINT "production_attachments_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachments" ADD CONSTRAINT "production_attachments_activity_id_production_task_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."production_task_activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachments" ADD CONSTRAINT "production_attachments_anchor_id_production_anchors_id_fk" FOREIGN KEY ("anchor_id") REFERENCES "public"."production_anchors"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachments" ADD CONSTRAINT "production_attachments_shopping_id_production_shoppings_id_fk" FOREIGN KEY ("shopping_id") REFERENCES "public"."production_shoppings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_attachments" ADD CONSTRAINT "production_attachments_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comments" ADD CONSTRAINT "production_comments_workflow_id_production_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."production_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comments" ADD CONSTRAINT "production_comments_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_comments" ADD CONSTRAINT "production_comments_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_deliveries" ADD CONSTRAINT "production_deliveries_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_deliveries" ADD CONSTRAINT "production_deliveries_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_deliveries" ADD CONSTRAINT "production_deliveries_signed_by_id_users_id_fk" FOREIGN KEY ("signed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_deliveries" ADD CONSTRAINT "production_deliveries_signature_upload_id_uploads_id_fk" FOREIGN KEY ("signature_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_deliveries" ADD CONSTRAINT "production_deliveries_receiver_signature_upload_id_uploads_id_fk" FOREIGN KEY ("receiver_signature_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_delivery_lines" ADD CONSTRAINT "production_delivery_lines_delivery_id_production_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."production_deliveries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_delivery_lines" ADD CONSTRAINT "production_delivery_lines_item_id_production_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_items"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_delivery_lines" ADD CONSTRAINT "production_delivery_lines_verified_by_id_users_id_fk" FOREIGN KEY ("verified_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_item_images" ADD CONSTRAINT "production_item_images_item_id_production_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_item_images" ADD CONSTRAINT "production_item_images_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_category_id_production_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."production_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_items" ADD CONSTRAINT "production_items_shopping_id_production_shoppings_id_fk" FOREIGN KEY ("shopping_id") REFERENCES "public"."production_shoppings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_props" ADD CONSTRAINT "production_props_continuity_id_production_continuities_id_fk" FOREIGN KEY ("continuity_id") REFERENCES "public"."production_continuities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_props" ADD CONSTRAINT "production_props_item_id_production_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_props" ADD CONSTRAINT "production_props_video_id_production_videos_id_fk" FOREIGN KEY ("video_id") REFERENCES "public"."production_videos"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_props" ADD CONSTRAINT "production_props_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_order_lines" ADD CONSTRAINT "production_purchase_order_lines_purchase_order_id_production_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."production_purchase_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_order_lines" ADD CONSTRAINT "production_purchase_order_lines_measurement_id_warehouse_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."warehouse_measurements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_orders" ADD CONSTRAINT "production_purchase_orders_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_orders" ADD CONSTRAINT "production_purchase_orders_category_id_production_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."production_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_orders" ADD CONSTRAINT "production_purchase_orders_delivery_address_id_company_addresses_id_fk" FOREIGN KEY ("delivery_address_id") REFERENCES "public"."company_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_orders" ADD CONSTRAINT "production_purchase_orders_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_purchase_orders" ADD CONSTRAINT "production_purchase_orders_canceled_by_id_users_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_set_items" ADD CONSTRAINT "production_set_items_set_id_production_sets_id_fk" FOREIGN KEY ("set_id") REFERENCES "public"."production_sets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_set_items" ADD CONSTRAINT "production_set_items_item_id_production_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."production_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_sets" ADD CONSTRAINT "production_sets_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_sets" ADD CONSTRAINT "production_sets_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_sets" ADD CONSTRAINT "production_sets_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shoppings" ADD CONSTRAINT "production_shoppings_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shoppings" ADD CONSTRAINT "production_shoppings_category_id_production_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."production_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shoppings" ADD CONSTRAINT "production_shoppings_provider_id_counterparties_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_shoppings" ADD CONSTRAINT "production_shoppings_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_task_activities" ADD CONSTRAINT "production_task_activities_task_id_production_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."production_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_task_activities" ADD CONSTRAINT "production_task_activities_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_task_activities" ADD CONSTRAINT "production_task_activities_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_workflow_id_production_workflows_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."production_workflows"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_category_id_production_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."production_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_character_id_production_characters_id_fk" FOREIGN KEY ("character_id") REFERENCES "public"."production_characters"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_tasks" ADD CONSTRAINT "production_tasks_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_workflows" ADD CONSTRAINT "production_workflows_production_id_productions_id_fk" FOREIGN KEY ("production_id") REFERENCES "public"."productions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_workflows" ADD CONSTRAINT "production_workflows_scene_id_production_scenes_id_fk" FOREIGN KEY ("scene_id") REFERENCES "public"."production_scenes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_workflows" ADD CONSTRAINT "production_workflows_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_board_sizes" ADD CONSTRAINT "pixit_board_sizes_board_id_pixit_boards_id_fk" FOREIGN KEY ("board_id") REFERENCES "public"."pixit_boards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_board_sizes" ADD CONSTRAINT "pixit_board_sizes_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_boards" ADD CONSTRAINT "pixit_boards_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_cash_sessions" ADD CONSTRAINT "pixit_cash_sessions_store_id_pixit_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pixit_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_cash_sessions" ADD CONSTRAINT "pixit_cash_sessions_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_colors" ADD CONSTRAINT "pixit_colors_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_definitions" ADD CONSTRAINT "pixit_inventory_definitions_store_id_pixit_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pixit_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_definitions" ADD CONSTRAINT "pixit_inventory_definitions_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_movements" ADD CONSTRAINT "pixit_inventory_movements_definition_id_pixit_inventory_definitions_id_fk" FOREIGN KEY ("definition_id") REFERENCES "public"."pixit_inventory_definitions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_movements" ADD CONSTRAINT "pixit_inventory_movements_sale_id_pixit_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."pixit_sales"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_movements" ADD CONSTRAINT "pixit_inventory_movements_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_movements" ADD CONSTRAINT "pixit_inventory_movements_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_movements" ADD CONSTRAINT "pixit_inventory_movements_parent_fk" FOREIGN KEY ("parent_movement_id") REFERENCES "public"."pixit_inventory_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_inventory_movements" ADD CONSTRAINT "pixit_inventory_movements_compensates_fk" FOREIGN KEY ("compensates_movement_id") REFERENCES "public"."pixit_inventory_movements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_product_images" ADD CONSTRAINT "pixit_product_images_product_id_pixit_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."pixit_products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_product_images" ADD CONSTRAINT "pixit_product_images_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_products" ADD CONSTRAINT "pixit_products_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_rooms" ADD CONSTRAINT "pixit_rooms_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_sales" ADD CONSTRAINT "pixit_sales_store_id_pixit_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."pixit_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_sales" ADD CONSTRAINT "pixit_sales_session_id_pixit_cash_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."pixit_cash_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_sales" ADD CONSTRAINT "pixit_sales_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_sales" ADD CONSTRAINT "pixit_sales_voided_by_id_users_id_fk" FOREIGN KEY ("voided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_sheets" ADD CONSTRAINT "pixit_sheets_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_stores" ADD CONSTRAINT "pixit_stores_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_stores" ADD CONSTRAINT "pixit_stores_address_id_company_addresses_id_fk" FOREIGN KEY ("address_id") REFERENCES "public"."company_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pixit_stores" ADD CONSTRAINT "pixit_stores_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_customizations" ADD CONSTRAINT "website_customizations_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "website_customizations" ADD CONSTRAINT "website_customizations_banner_upload_id_uploads_id_fk" FOREIGN KEY ("banner_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_category_id_global_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."global_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_pixit_store_id_pixit_stores_id_fk" FOREIGN KEY ("pixit_store_id") REFERENCES "public"."pixit_stores"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_logo_upload_id_uploads_id_fk" FOREIGN KEY ("logo_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_icon_upload_id_uploads_id_fk" FOREIGN KEY ("icon_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_images" ADD CONSTRAINT "location_images_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_images" ADD CONSTRAINT "location_images_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_networks" ADD CONSTRAINT "location_networks_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_networks" ADD CONSTRAINT "location_networks_image_upload_id_uploads_id_fk" FOREIGN KEY ("image_upload_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_tags" ADD CONSTRAINT "location_tags_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "public"."locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_tags" ADD CONSTRAINT "location_tags_category_id_global_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."global_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_network_id_location_networks_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."location_networks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_category_id_global_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."global_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_type_id_global_categories_id_fk" FOREIGN KEY ("type_id") REFERENCES "public"."global_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "locations" ADD CONSTRAINT "locations_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_order_lines" ADD CONSTRAINT "buyer_order_lines_order_id_buyer_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."buyer_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "buyer_orders" ADD CONSTRAINT "buyer_orders_shipment_id_shipments_id_fk" FOREIGN KEY ("shipment_id") REFERENCES "public"."shipments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_merchant_profile_id_merchant_profiles_id_fk" FOREIGN KEY ("merchant_profile_id") REFERENCES "public"."merchant_profiles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_ship_from_address_id_company_addresses_id_fk" FOREIGN KEY ("ship_from_address_id") REFERENCES "public"."company_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checkouts" ADD CONSTRAINT "checkouts_ship_to_address_id_user_addresses_id_fk" FOREIGN KEY ("ship_to_address_id") REFERENCES "public"."user_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_buyer_id_users_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_from_address_id_company_addresses_id_fk" FOREIGN KEY ("from_address_id") REFERENCES "public"."company_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_to_address_id_user_addresses_id_fk" FOREIGN KEY ("to_address_id") REFERENCES "public"."user_addresses"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_order_id_warehouse_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."warehouse_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_order_lines" ADD CONSTRAINT "warehouse_order_lines_measurement_id_warehouse_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."warehouse_measurements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_order_messages" ADD CONSTRAINT "warehouse_order_messages_order_id_warehouse_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."warehouse_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_order_messages" ADD CONSTRAINT "warehouse_order_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_order_messages" ADD CONSTRAINT "warehouse_order_messages_reply_fk" FOREIGN KEY ("reply_to_id") REFERENCES "public"."warehouse_order_messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_purchase_order_id_production_purchase_orders_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."production_purchase_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_buyer_order_id_buyer_orders_id_fk" FOREIGN KEY ("buyer_order_id") REFERENCES "public"."buyer_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_client_id_counterparties_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_provider_id_counterparties_id_fk" FOREIGN KEY ("provider_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_orders" ADD CONSTRAINT "warehouse_orders_canceled_by_id_users_id_fk" FOREIGN KEY ("canceled_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_lines" ADD CONSTRAINT "warehouse_quote_lines_quote_id_warehouse_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."warehouse_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_lines" ADD CONSTRAINT "warehouse_quote_lines_measurement_id_warehouse_measurements_id_fk" FOREIGN KEY ("measurement_id") REFERENCES "public"."warehouse_measurements"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_lines" ADD CONSTRAINT "warehouse_quote_lines_product_price_id_warehouse_product_prices_id_fk" FOREIGN KEY ("product_price_id") REFERENCES "public"."warehouse_product_prices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_payment_vouchers" ADD CONSTRAINT "warehouse_quote_payment_vouchers_payment_id_warehouse_quote_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."warehouse_quote_payments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_payment_vouchers" ADD CONSTRAINT "warehouse_quote_payment_vouchers_upload_id_uploads_id_fk" FOREIGN KEY ("upload_id") REFERENCES "public"."uploads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_payments" ADD CONSTRAINT "warehouse_quote_payments_quote_id_warehouse_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."warehouse_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quote_payments" ADD CONSTRAINT "warehouse_quote_payments_paid_by_id_users_id_fk" FOREIGN KEY ("paid_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quotes" ADD CONSTRAINT "warehouse_quotes_warehouse_id_warehouses_id_fk" FOREIGN KEY ("warehouse_id") REFERENCES "public"."warehouses"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quotes" ADD CONSTRAINT "warehouse_quotes_order_id_warehouse_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."warehouse_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quotes" ADD CONSTRAINT "warehouse_quotes_client_id_counterparties_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."counterparties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quotes" ADD CONSTRAINT "warehouse_quotes_responsible_id_users_id_fk" FOREIGN KEY ("responsible_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quotes" ADD CONSTRAINT "warehouse_quotes_client_signature_id_uploads_id_fk" FOREIGN KEY ("client_signature_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_quotes" ADD CONSTRAINT "warehouse_quotes_responsible_signature_id_uploads_id_fk" FOREIGN KEY ("responsible_signature_id") REFERENCES "public"."uploads"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_reservations" ADD CONSTRAINT "warehouse_stock_reservations_stock_unit_id_warehouse_stock_units_id_fk" FOREIGN KEY ("stock_unit_id") REFERENCES "public"."warehouse_stock_units"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_reservations" ADD CONSTRAINT "warehouse_stock_reservations_quote_line_id_warehouse_quote_lines_id_fk" FOREIGN KEY ("quote_line_id") REFERENCES "public"."warehouse_quote_lines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_reservations" ADD CONSTRAINT "warehouse_stock_reservations_quote_id_warehouse_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."warehouse_quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warehouse_stock_reservations" ADD CONSTRAINT "warehouse_stock_reservations_checkout_id_checkouts_id_fk" FOREIGN KEY ("checkout_id") REFERENCES "public"."checkouts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "company_subscriptions_company_unique" ON "company_subscriptions" USING btree ("company_id") WHERE status <> 'canceled';--> statement-breakpoint
CREATE UNIQUE INDEX "company_subscriptions_external_unique" ON "company_subscriptions" USING btree ("external_subscription_id");--> statement-breakpoint
CREATE INDEX "company_subscriptions_status_idx" ON "company_subscriptions" USING btree ("status","period_end");--> statement-breakpoint
CREATE INDEX "merchant_payments_company_idx" ON "merchant_payments" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_payments_intent_unique" ON "merchant_payments" USING btree ("external_payment_intent_id") WHERE external_payment_intent_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_profiles_primary_unique" ON "merchant_profiles" USING btree ("company_id") WHERE is_primary = true AND deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "merchant_profiles_external_unique" ON "merchant_profiles" USING btree ("external_account_id") WHERE external_account_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "merchant_profiles_company_idx" ON "merchant_profiles" USING btree ("company_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_payments_invoice_unique" ON "subscription_payments" USING btree ("external_invoice_id") WHERE external_invoice_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "subscription_payments_company_idx" ON "subscription_payments" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "subscription_plans_external_unique" ON "subscription_plans" USING btree ("external_product_id") WHERE external_product_id IS NOT NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "subscription_plans_tier_idx" ON "subscription_plans" USING btree ("tier");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_categories_slug_unique" ON "warehouse_categories" USING btree ("warehouse_id","slug");--> statement-breakpoint
CREATE INDEX "warehouse_categories_tree_idx" ON "warehouse_categories" USING btree ("warehouse_id","parent_id");--> statement-breakpoint
CREATE INDEX "warehouse_measurements_product_idx" ON "warehouse_measurements" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "warehouse_price_lists_warehouse_idx" ON "warehouse_price_lists" USING btree ("warehouse_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_product_prices_unique" ON "warehouse_product_prices" USING btree ("price_list_id","product_id");--> statement-breakpoint
CREATE INDEX "warehouse_product_prices_product_idx" ON "warehouse_product_prices" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_products_code_unique" ON "warehouse_products" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_products_slug_unique" ON "warehouse_products" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_products_legacy_unique" ON "warehouse_products" USING btree ("legacy_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_products_root_idx" ON "warehouse_products" USING btree ("warehouse_id","created_at") WHERE parent_id IS NULL AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_products_storage_idx" ON "warehouse_products" USING btree ("storage_id");--> statement-breakpoint
CREATE INDEX "warehouse_products_category_idx" ON "warehouse_products" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "warehouse_stock_events_unit_idx" ON "warehouse_stock_events" USING btree ("stock_unit_id","occurred_at");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_stock_units_code_unique" ON "warehouse_stock_units" USING btree ("code");--> statement-breakpoint
CREATE INDEX "warehouse_stock_units_availability_idx" ON "warehouse_stock_units" USING btree ("measurement_id","status") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_storages_code_unique" ON "warehouse_storages" USING btree ("warehouse_id","code");--> statement-breakpoint
CREATE INDEX "warehouse_storages_tree_idx" ON "warehouse_storages" USING btree ("warehouse_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_slug_unique" ON "warehouses" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "warehouses_legacy_unique" ON "warehouses" USING btree ("legacy_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouses_company_idx" ON "warehouses" USING btree ("company_id","priority","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_categories_slug_unique" ON "production_categories" USING btree ("production_id","slug");--> statement-breakpoint
CREATE INDEX "production_categories_tree_idx" ON "production_categories" USING btree ("production_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_chapters_index_unique" ON "production_chapters" USING btree ("production_id","index") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "production_chapters_production_idx" ON "production_chapters" USING btree ("production_id","index");--> statement-breakpoint
CREATE INDEX "production_characters_production_idx" ON "production_characters" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "production_continuities_recording_idx" ON "production_continuities" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "production_recording_notes_recording_idx" ON "production_recording_notes" USING btree ("recording_id");--> statement-breakpoint
CREATE INDEX "production_recordings_production_idx" ON "production_recordings" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "production_recordings_scene_idx" ON "production_recordings" USING btree ("scene_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_scenes_index_unique" ON "production_scenes" USING btree ("chapter_id","index") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "production_scenes_chapter_idx" ON "production_scenes" USING btree ("chapter_id","index");--> statement-breakpoint
CREATE INDEX "production_scripts_production_idx" ON "production_scripts" USING btree ("production_id","index");--> statement-breakpoint
CREATE INDEX "production_videos_production_idx" ON "production_videos" USING btree ("production_id");--> statement-breakpoint
CREATE UNIQUE INDEX "productions_slug_unique" ON "productions" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "productions_legacy_unique" ON "productions" USING btree ("legacy_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "productions_company_idx" ON "productions" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE INDEX "production_anchors_production_idx" ON "production_anchors" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "production_attachments_task_idx" ON "production_attachments" USING btree ("task_id");--> statement-breakpoint
CREATE INDEX "production_attachments_shopping_idx" ON "production_attachments" USING btree ("shopping_id");--> statement-breakpoint
CREATE INDEX "production_comments_workflow_idx" ON "production_comments" USING btree ("workflow_id","created_at");--> statement-breakpoint
CREATE INDEX "production_comments_task_idx" ON "production_comments" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE INDEX "production_deliveries_production_idx" ON "production_deliveries" USING btree ("production_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "production_delivery_lines_unique" ON "production_delivery_lines" USING btree ("delivery_id","item_id");--> statement-breakpoint
CREATE INDEX "production_delivery_lines_delivery_idx" ON "production_delivery_lines" USING btree ("delivery_id","is_verified");--> statement-breakpoint
CREATE UNIQUE INDEX "production_item_images_unique" ON "production_item_images" USING btree ("item_id","upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_items_code_unique" ON "production_items" USING btree ("code");--> statement-breakpoint
CREATE INDEX "production_items_production_idx" ON "production_items" USING btree ("production_id","status");--> statement-breakpoint
CREATE INDEX "production_items_shopping_idx" ON "production_items" USING btree ("shopping_id");--> statement-breakpoint
CREATE INDEX "production_props_continuity_idx" ON "production_props" USING btree ("continuity_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_props_item_unique" ON "production_props" USING btree ("continuity_id","item_id") WHERE item_id IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "production_props_video_unique" ON "production_props" USING btree ("continuity_id","video_id") WHERE video_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "production_purchase_order_lines_order_idx" ON "production_purchase_order_lines" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_purchase_orders_code_unique" ON "production_purchase_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "production_purchase_orders_production_idx" ON "production_purchase_orders" USING btree ("production_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "production_set_items_unique" ON "production_set_items" USING btree ("set_id","item_id");--> statement-breakpoint
CREATE INDEX "production_sets_production_idx" ON "production_sets" USING btree ("production_id");--> statement-breakpoint
CREATE INDEX "production_shoppings_production_idx" ON "production_shoppings" USING btree ("production_id","occurred_on");--> statement-breakpoint
CREATE INDEX "production_task_activities_task_idx" ON "production_task_activities" USING btree ("task_id","status");--> statement-breakpoint
CREATE INDEX "production_tasks_workflow_idx" ON "production_tasks" USING btree ("workflow_id","status");--> statement-breakpoint
CREATE INDEX "production_tasks_filter_idx" ON "production_tasks" USING btree ("category_id","character_id");--> statement-breakpoint
CREATE UNIQUE INDEX "production_workflows_code_unique" ON "production_workflows" USING btree ("code");--> statement-breakpoint
CREATE INDEX "production_workflows_calendar_idx" ON "production_workflows" USING btree ("production_id","scheduled_for");--> statement-breakpoint
CREATE INDEX "pixit_board_sizes_board_idx" ON "pixit_board_sizes" USING btree ("board_id");--> statement-breakpoint
CREATE INDEX "pixit_boards_name_idx" ON "pixit_boards" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_cash_sessions_active_unique" ON "pixit_cash_sessions" USING btree ("store_id") WHERE status = 'active';--> statement-breakpoint
CREATE INDEX "pixit_cash_sessions_store_idx" ON "pixit_cash_sessions" USING btree ("store_id","opened_at");--> statement-breakpoint
CREATE INDEX "pixit_colors_name_idx" ON "pixit_colors" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_inventory_definitions_unique" ON "pixit_inventory_definitions" USING btree ("store_id","kind","catalog_ref_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "pixit_inventory_definitions_store_idx" ON "pixit_inventory_definitions" USING btree ("store_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_inventory_movements_compensates_unique" ON "pixit_inventory_movements" USING btree ("compensates_movement_id") WHERE compensates_movement_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "pixit_inventory_movements_definition_idx" ON "pixit_inventory_movements" USING btree ("definition_id");--> statement-breakpoint
CREATE INDEX "pixit_inventory_movements_sale_idx" ON "pixit_inventory_movements" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "pixit_inventory_movements_tree_idx" ON "pixit_inventory_movements" USING btree ("parent_movement_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_product_images_unique" ON "pixit_product_images" USING btree ("product_id","upload_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_products_slug_unique" ON "pixit_products" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "pixit_products_company_idx" ON "pixit_products" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "pixit_rooms_name_idx" ON "pixit_rooms" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_sales_code_unique" ON "pixit_sales" USING btree ("code");--> statement-breakpoint
CREATE INDEX "pixit_sales_session_idx" ON "pixit_sales" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "pixit_sales_store_idx" ON "pixit_sales" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "pixit_sheets_size_idx" ON "pixit_sheets" USING btree ("bricks_x","bricks_y");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_stores_slug_unique" ON "pixit_stores" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "pixit_stores_company_idx" ON "pixit_stores" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "pixit_terms_language_unique" ON "pixit_terms" USING btree ("language_code") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "website_customizations_primary_unique" ON "website_customizations" USING btree ("website_id") WHERE is_primary = true AND deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "website_customizations_window_idx" ON "website_customizations" USING btree ("website_id","starts_at","ends_at");--> statement-breakpoint
CREATE UNIQUE INDEX "websites_slug_unique" ON "websites" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "websites_legacy_unique" ON "websites" USING btree ("legacy_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "websites_company_idx" ON "websites" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_images_unique" ON "location_images" USING btree ("location_id","upload_id");--> statement-breakpoint
CREATE INDEX "location_networks_company_idx" ON "location_networks" USING btree ("company_id");--> statement-breakpoint
CREATE UNIQUE INDEX "location_tags_unique" ON "location_tags" USING btree ("location_id","category_id","facet");--> statement-breakpoint
CREATE INDEX "location_tags_location_idx" ON "location_tags" USING btree ("location_id","facet");--> statement-breakpoint
CREATE UNIQUE INDEX "locations_slug_unique" ON "locations" USING btree ("slug") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "locations_legacy_unique" ON "locations" USING btree ("legacy_id") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "locations_network_idx" ON "locations" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "locations_category_idx" ON "locations" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "buyer_order_lines_order_idx" ON "buyer_order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "buyer_orders_reference_unique" ON "buyer_orders" USING btree ("reference");--> statement-breakpoint
CREATE INDEX "buyer_orders_buyer_idx" ON "buyer_orders" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "buyer_orders_company_idx" ON "buyer_orders" USING btree ("company_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "checkouts_session_unique" ON "checkouts" USING btree ("external_session_id") WHERE external_session_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "checkouts_expiry_idx" ON "checkouts" USING btree ("expires_at") WHERE status = 'pending';--> statement-breakpoint
CREATE INDEX "checkouts_buyer_idx" ON "checkouts" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_events_external_unique" ON "payment_events" USING btree ("external_event_id");--> statement-breakpoint
CREATE INDEX "payment_events_pending_idx" ON "payment_events" USING btree ("received_at") WHERE processed_at IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "payments_intent_unique" ON "payments" USING btree ("external_payment_intent_id") WHERE external_payment_intent_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "payments_checkout_idx" ON "payments" USING btree ("checkout_id");--> statement-breakpoint
CREATE INDEX "shipments_status_idx" ON "shipments" USING btree ("status","estimated_delivery_at");--> statement-breakpoint
CREATE INDEX "warehouse_order_lines_order_idx" ON "warehouse_order_lines" USING btree ("order_id","position");--> statement-breakpoint
CREATE INDEX "warehouse_order_messages_order_idx" ON "warehouse_order_messages" USING btree ("order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_orders_code_unique" ON "warehouse_orders" USING btree ("code");--> statement-breakpoint
CREATE INDEX "warehouse_orders_queue_idx" ON "warehouse_orders" USING btree ("warehouse_id","priority","created_at") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_orders_purchase_idx" ON "warehouse_orders" USING btree ("purchase_order_id");--> statement-breakpoint
CREATE INDEX "warehouse_quote_lines_quote_idx" ON "warehouse_quote_lines" USING btree ("quote_id","position_product");--> statement-breakpoint
CREATE UNIQUE INDEX "quote_payment_vouchers_unique" ON "warehouse_quote_payment_vouchers" USING btree ("payment_id","upload_id");--> statement-breakpoint
CREATE INDEX "warehouse_quote_payments_quote_idx" ON "warehouse_quote_payments" USING btree ("quote_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_quotes_code_unique" ON "warehouse_quotes" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_quotes_folio_unique" ON "warehouse_quotes" USING btree ("folio") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_quotes_queue_idx" ON "warehouse_quotes" USING btree ("warehouse_id","priority","created_at") WHERE deleted_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_quotes_client_idx" ON "warehouse_quotes" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "warehouse_stock_reservations_unit_unique" ON "warehouse_stock_reservations" USING btree ("stock_unit_id") WHERE released_at IS NULL;--> statement-breakpoint
CREATE INDEX "warehouse_stock_reservations_line_idx" ON "warehouse_stock_reservations" USING btree ("quote_line_id");--> statement-breakpoint
CREATE INDEX "warehouse_stock_reservations_expiry_idx" ON "warehouse_stock_reservations" USING btree ("expires_at") WHERE released_at IS NULL AND expires_at IS NOT NULL;