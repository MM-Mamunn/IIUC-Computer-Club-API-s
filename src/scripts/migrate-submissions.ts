import 'dotenv/config';
import { db } from '../config/db';
import { sql } from 'drizzle-orm';

async function migrate() {
  console.log('Ensuring committee_submissions table exists...');
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "committee_submissions" (
      "id" serial PRIMARY KEY NOT NULL,
      "name" varchar(255) NOT NULL,
      "designation" varchar(255) NOT NULL,
      "matrix_id" varchar(50) NOT NULL,
      "batch" varchar(50) NOT NULL,
      "email" varchar(255) NOT NULL,
      "committee_number" varchar(255),
      "session" varchar(100),
      "photo_url" text,
      "bio" text,
      "skills" text,
      "portfolio_url" text,
      "github_url" text,
      "linkedin_url" text,
      "facebook_url" text,
      "status" varchar(50) NOT NULL DEFAULT 'pending',
      "created_at" timestamp with time zone NOT NULL DEFAULT now(),
      "updated_at" timestamp with time zone NOT NULL DEFAULT now()
    );
  `);
  console.log('✅ committee_submissions table created/verified successfully!');
  process.exit(0);
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
