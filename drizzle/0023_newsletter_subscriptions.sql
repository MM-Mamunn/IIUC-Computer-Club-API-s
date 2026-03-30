CREATE TABLE IF NOT EXISTS "newsletter_subscriptions" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" varchar(255) NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "source" varchar(50) NOT NULL DEFAULT 'landing-footer',
  "subscribed_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "newsletter_subscriptions_email_unique" UNIQUE("email")
);