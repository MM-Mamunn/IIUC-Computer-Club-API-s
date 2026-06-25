ALTER TABLE "events" ADD COLUMN "slug" varchar(600);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "use_external_form" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "external_form_url" text;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_slug_unique" UNIQUE("slug");