ALTER TABLE "event_registrations" ADD COLUMN "rejection_reason" varchar(500);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "rejection_history" jsonb;