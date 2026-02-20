ALTER TABLE "committee" ADD COLUMN "gender" varchar(20) DEFAULT 'male' NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "gender" varchar(20) DEFAULT 'male' NOT NULL;