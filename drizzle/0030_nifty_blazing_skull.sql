ALTER TABLE "committee" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "batch" varchar(50);--> statement-breakpoint
ALTER TABLE "committee_submissions" ADD CONSTRAINT "uq_sub_matrix_comm" UNIQUE("matrix_id","committee_number");