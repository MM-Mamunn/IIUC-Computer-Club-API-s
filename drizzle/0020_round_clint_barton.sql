CREATE TABLE "refund_requests" (
	"id" serial PRIMARY KEY NOT NULL,
	"event_id" integer NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"refund_amount" double precision NOT NULL,
	"subsidy_amount" double precision DEFAULT 0 NOT NULL,
	"original_payment_method" varchar(30),
	"original_transaction_id" varchar(255),
	"refund_method" varchar(30),
	"refund_account_number" varchar(255),
	"refund_account_owner_name" varchar(255),
	"is_different_from_payer" boolean DEFAULT false NOT NULL,
	"student_declaration_accepted" boolean DEFAULT false NOT NULL,
	"student_declaration_accepted_at" timestamp with time zone,
	"status" varchar(30) DEFAULT 'pending_destination' NOT NULL,
	"reviewed_by" varchar(255),
	"reviewed_at" timestamp with time zone,
	"admin_notes" text,
	"rejection_reason" text,
	"processed_by" varchar(255),
	"processed_at" timestamp with time zone,
	"refund_transaction_ref" varchar(255),
	"proof_url" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "rejection_type" varchar(30);--> statement-breakpoint
ALTER TABLE "event_registrations" ADD COLUMN "fix_payment_used" boolean DEFAULT false;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_reviewed_by_users_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "refund_requests" ADD CONSTRAINT "refund_requests_processed_by_users_id_fk" FOREIGN KEY ("processed_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
CREATE UNIQUE INDEX "refund_requests_event_user_uniq" ON "refund_requests" USING btree ("event_id","user_id");