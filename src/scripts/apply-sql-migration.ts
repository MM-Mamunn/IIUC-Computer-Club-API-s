/**
 * Apply one generated drizzle migration file in a single transaction.
 * This project syncs schema with `drizzle-kit push`, so the drizzle migrations
 * table is empty and `drizzle-kit migrate` would try to replay every file.
 *
 *   npm run db:apply-migration -- drizzle/0031_certificates_and_slugs.sql
 */
import 'dotenv/config';
import fs from 'node:fs';
import postgres from 'postgres';

const file = process.argv[2];
if (!file) {
  console.error('Usage: npm run db:apply-migration -- <drizzle/NNNN_name.sql>');
  process.exit(1);
}

const statements = fs
  .readFileSync(file, 'utf8')
  .split('--> statement-breakpoint')
  .map((s) => s.trim())
  .filter(Boolean);

const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 });
console.log(`Applying ${statements.length} statements from ${file} to ${new URL(process.env.DATABASE_URL!).hostname.split('.')[0]}`);

sql
  .begin(async (tx) => {
    for (const statement of statements) await tx.unsafe(statement);
  })
  .then(() => console.log('Done.'))
  .catch((err) => {
    console.error('Rolled back:', err.message);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
