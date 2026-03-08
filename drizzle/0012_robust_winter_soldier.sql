CREATE TABLE "event_managers" (
	"event_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"assigned_by" varchar(255),
	"assigned_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "event_managers_event_id_user_id_pk" PRIMARY KEY("event_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "event_managers" ADD CONSTRAINT "event_managers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_managers" ADD CONSTRAINT "event_managers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_managers" ADD CONSTRAINT "event_managers_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;