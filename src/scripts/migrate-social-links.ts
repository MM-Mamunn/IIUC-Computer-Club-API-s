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
    console.log('Adding social link columns if they do not exist...');
    
    // Add columns if not exists
    await sql`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS github_url text,
      ADD COLUMN IF NOT EXISTS linkedin_url text,
      ADD COLUMN IF NOT EXISTS facebook_url text,
      ADD COLUMN IF NOT EXISTS twitter_url text;
    `;

    console.log('Migration completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sql.end();
  }
}

run();
