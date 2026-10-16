CREATE TABLE "committee_submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"designation" varchar(255) NOT NULL,
	"matrix_id" varchar(50) NOT NULL,
	"batch" varchar(50) NOT NULL,
	"email" varchar(255) NOT NULL,
	"committee_number" varchar(255),
	"session" varchar(100),
	"photo_url" text,
	"bio" text,
	"skills" text,
	"portfolio_url" text,
	"github_url" text,
	"linkedin_url" text,
	"facebook_url" text,
	"status" varchar(50) DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "github_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "linkedin_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "facebook_url" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "twitter_url" text;