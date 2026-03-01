ALTER TABLE "executives" RENAME COLUMN "committee" TO "number";--> statement-breakpoint
ALTER TABLE "executives" DROP CONSTRAINT "executives_committee_committee_number_fk";
--> statement-breakpoint
ALTER TABLE "executives" DROP CONSTRAINT "executives_id_committee_pk";--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_id_number_pk" PRIMARY KEY("id","number");--> statement-breakpoint
ALTER TABLE "executives" ADD CONSTRAINT "executives_number_committee_number_fk" FOREIGN KEY ("number") REFERENCES "public"."committee"("number") ON DELETE cascade ON UPDATE cascade;