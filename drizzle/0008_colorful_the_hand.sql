CREATE TABLE "event_duties" (
	"event_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"duty" varchar(500) NOT NULL,
	"description" text,
	"assigned_by" varchar(255),
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "event_duties_event_id_user_id_duty_pk" PRIMARY KEY("event_id","user_id","duty")
);
--> statement-breakpoint
CREATE TABLE "event_registrations" (
	"event_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"registered_at" timestamp with time zone DEFAULT now(),
	"payment_status" varchar(20) DEFAULT 'pending',
	CONSTRAINT "event_registrations_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" varchar(500) NOT NULL,
	"description" text,
	"committee_number" varchar(255) NOT NULL,
	"event_date" timestamp with time zone NOT NULL,
	"registration_deadline" timestamp with time zone,
	"venue" varchar(500),
	"is_paid" boolean DEFAULT false NOT NULL,
	"fee" double precision DEFAULT 0,
	"max_participants" integer,
	"banner_image" text,
	"status" varchar(20) DEFAULT 'upcoming' NOT NULL,
	"created_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "event_duties" ADD CONSTRAINT "event_duties_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_duties" ADD CONSTRAINT "event_duties_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_duties" ADD CONSTRAINT "event_duties_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_registrations" ADD CONSTRAINT "event_registrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_committee_number_committee_number_fk" FOREIGN KEY ("committee_number") REFERENCES "public"."committee"("number") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;