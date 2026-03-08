ALTER TABLE "events" ADD COLUMN "allocated_budget" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "finances_locked" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "finances_locked_by" varchar(255);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "finances_locked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_finances_locked_by_users_id_fk" FOREIGN KEY ("finances_locked_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;