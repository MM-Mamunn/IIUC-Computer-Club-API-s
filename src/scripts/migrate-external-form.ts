import postgres from 'postgres';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL is not set in .env');
  process.exit(1);
}

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl!);

  try {
    console.log('Adding use_external_form and external_form_url columns...');
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS use_external_form boolean NOT NULL DEFAULT false;
    `;
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS external_form_url text;
    `;
    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sql.end();
  }
}

run();
