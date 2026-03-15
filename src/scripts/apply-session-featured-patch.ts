import 'dotenv/config';
import postgres from 'postgres';

async function run() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is not set');
  }

  const sql = postgres(process.env.DATABASE_URL);

  await sql.unsafe(
    'ALTER TABLE "committee" ADD COLUMN IF NOT EXISTS "session" varchar(100) NOT NULL DEFAULT \'Session Not Set\';',
  );

  await sql.unsafe(
    'ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "is_featured" boolean NOT NULL DEFAULT false;',
  );

  await sql.unsafe('ALTER TABLE "committee" ALTER COLUMN "session" DROP DEFAULT;');

  await sql.end();
  console.log('Schema patch applied successfully');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
