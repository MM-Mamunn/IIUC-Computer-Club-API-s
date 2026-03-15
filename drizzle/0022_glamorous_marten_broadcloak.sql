ALTER TABLE "committee" ADD COLUMN "session" varchar(100) NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_featured" boolean DEFAULT false NOT NULL;