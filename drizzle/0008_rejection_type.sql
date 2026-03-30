ALTER TABLE "event_registrations" ADD COLUMN "rejection_type" varchar(30);
ALTER TABLE "event_registrations" ADD COLUMN "fix_payment_used" boolean DEFAULT false;
