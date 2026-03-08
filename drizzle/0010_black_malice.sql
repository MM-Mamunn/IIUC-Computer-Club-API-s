ALTER TABLE "event_registrations" ADD COLUMN "custom_field_responses" jsonb;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "custom_fields" jsonb;