ALTER TABLE "committee" ADD COLUMN IF NOT EXISTS "session" varchar(100) NOT NULL DEFAULT 'Session Not Set';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false;

ALTER TABLE "committee" ALTER COLUMN "session" DROP DEFAULT;
