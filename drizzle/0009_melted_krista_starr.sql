ALTER TABLE "event_registrations" ADD COLUMN "payment_method" varchar(30);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "transaction_id" varchar(255);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "sslcommerz_val_id" varchar(255);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "sslcommerz_tran_id" varchar(255);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "draft_data" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "payment_numbers" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "sslcommerz_enabled" boolean DEFAULT false NOT NULL;