ALTER TABLE "users" ADD COLUMN "id_card" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "department" varchar(100);--> statement-breakpoint
ALTER TABLE "expense_claims" ADD COLUMN "audit_history" jsonb;