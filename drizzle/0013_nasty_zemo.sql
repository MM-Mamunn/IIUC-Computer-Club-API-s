CREATE TABLE "event_expenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"description" varchar(1000) NOT NULL,
	"amount" double precision NOT NULL,
	"category" varchar(100) DEFAULT 'other' NOT NULL,
	"receipt_image" text,
	"submitted_by" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "expense_claims" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"description" varchar(1000) NOT NULL,
	"amount" double precision NOT NULL,
	"proof_image" text NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"submitted_at" timestamp with time zone DEFAULT now(),
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp with time zone,
	"notes" text,
	"paid_by" varchar(255),
	"paid_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "vouchers" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"voucher_number" varchar(100) NOT NULL,
	"type" varchar(30) DEFAULT 'event_summary' NOT NULL,
	"total_revenue" double precision DEFAULT 0 NOT NULL,
	"total_expense" double precision DEFAULT 0 NOT NULL,
	"club_subsidy" double precision DEFAULT 0 NOT NULL,
	"net_amount" double precision DEFAULT 0 NOT NULL,
	"data" jsonb,
	"generated_by" varchar(255) NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "vouchers_voucher_number_unique" UNIQUE("voucher_number")
);
--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "estimated_budget" double precision DEFAULT 0;--> statement-breakpoint
ALTER TABLE "event_expenses" ADD CONSTRAINT "event_expenses_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "event_expenses" ADD CONSTRAINT "event_expenses_submitted_by_users_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "expense_claims" ADD CONSTRAINT "expense_claims_paid_by_users_id_fk" FOREIGN KEY ("paid_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "vouchers" ADD CONSTRAINT "vouchers_generated_by_users_id_fk" FOREIGN KEY ("generated_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;