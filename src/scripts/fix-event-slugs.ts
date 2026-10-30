/**
 * Regenerate slugs that the old ASCII-only slugifier left without any words,
 * e.g. "-54" for a title written in styled Unicode ("𝐅𝐀𝐑𝐄𝐖𝐄𝐋𝐋 …").
 * Old links still resolve through the "-<id>" fallback in getEventById.
 *
 *   npm run db:fix-slugs -- --dry-run
 */
import 'dotenv/config';
import postgres from 'postgres';
import { generateEventSlug } from '../modules/event/event.service';

const dryRun = process.argv.includes('--dry-run');
const sql = postgres(process.env.DATABASE_URL!, { ssl: 'require', max: 1 });

const main = async () => {
  const rows = await sql<{ id: number; title: string; slug: string | null }[]>`
    select id, title, slug from events where slug is null or slug ~ '^-*[0-9]*$' order by id`;
  console.log(`Found ${rows.length} events with a missing or word-less slug.`);
  for (const row of rows) {
    const slug = generateEventSlug(row.title, row.id);
    console.log(`  ${row.id}: ${JSON.stringify(row.slug)} -> ${slug}`);
    if (!dryRun) await sql`update events set slug = ${slug} where id = ${row.id}`;
  }
  console.log(dryRun ? 'Dry run, nothing changed.' : 'Done.');
};

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => sql.end());
