CREATE TABLE "committee" (
	"number" varchar(255) PRIMARY KEY NOT NULL,
	"start" date NOT NULL,
	"end" date,
	"beginning_budget" double precision,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "executives" (
	"id" varchar(255) NOT NULL,
	"role" varchar(255),
	"position" varchar(255),
	"committee" varchar(255) NOT NULL,
	"assigned_by" varchar(255)
);
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_role_role_role_fk";
--> statement-breakpoint
ALTER TABLE "users" DROP CONSTRAINT "users_position_position_position_fk";
--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_role_role_role_fk" FOREIGN KEY ("role") REFERENCES "public"."role"("role") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_position_position_position_fk" FOREIGN KEY ("position") REFERENCES "public"."position"("position") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_committee_committee_number_fk" FOREIGN KEY ("committee") REFERENCES "public"."committee"("number") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_assigned_by_users_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "position";