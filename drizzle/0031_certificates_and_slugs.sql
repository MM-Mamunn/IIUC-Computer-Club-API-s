CREATE TABLE "certificate_templates" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"background_url" text NOT NULL,
	"width" integer NOT NULL,
	"height" integer NOT NULL,
	"fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"updated_by" varchar(255),
	"updated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "certificate_templates_event_id_unique" UNIQUE("event_id")
);
--> statement-breakpoint
CREATE TABLE "certificates" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" varchar(32) NOT NULL,
	"event_id" integer NOT NULL,
	"recipient_name" varchar(255) NOT NULL,
	"recipient_email" varchar(255),
	"matrix_id" varchar(50),
	"user_id" varchar(255),
	"source" varchar(20) DEFAULT 'registration' NOT NULL,
	"issued_by" varchar(255),
	"issued_at" timestamp with time zone DEFAULT now(),
	"emailed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "certificates_code_unique" UNIQUE("code")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "certificate_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "certificate_templates" ADD CONSTRAINT "certificate_templates_updated_by_users_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "certificates" ADD CONSTRAINT "certificates_issued_by_users_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;