CREATE TABLE "position" (
	"position" varchar(255) PRIMARY KEY NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "role" (
	"role" varchar(255) PRIMARY KEY NOT NULL,
	"description" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"email" varchar(255) NOT NULL,
	"password" text NOT NULL,
	"role" varchar(255),
	"position" varchar(255),
	"profile_image" text,
	"created_at" timestamp with time zone DEFAULT now(),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_role_role_role_fk" FOREIGN KEY ("role") REFERENCES "public"."role"("role") ON DELETE restrict ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_position_position_position_fk" FOREIGN KEY ("position") REFERENCES "public"."position"("position") ON DELETE restrict ON UPDATE cascade;