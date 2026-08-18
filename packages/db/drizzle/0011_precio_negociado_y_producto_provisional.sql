ALTER TABLE "warehouse_quote_lines" ADD COLUMN "price" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "warehouse_products" ADD COLUMN "is_provisional" boolean DEFAULT false NOT NULL;