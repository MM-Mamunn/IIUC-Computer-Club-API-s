ALTER TABLE "event_registrations" ADD COLUMN "donation_amount" double precision;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_donation" boolean DEFAULT false NOT NULL;