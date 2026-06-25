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

// Re-implement the slug generation utility to be self-contained
export function generateEventSlug(title: string, id: number): string {
  const base = title
    .toLowerCase()
    .normalize('NFD')                    // decompose accents
    .replace(/[\u0300-\u036f]/g, '')     // strip diacritics
    .replace(/[^a-z0-9\s-]/g, '')        // keep alphanumeric, spaces, hyphens
    .trim()
    .replace(/\s+/g, '-')               // spaces → hyphens
    .replace(/-+/g, '-')                // collapse multiple hyphens
    .slice(0, 120);                      // cap base at 120 chars
  return `${base}-${id}`;
}

async function run() {
  console.log('Connecting to database...');
  const sql = postgres(databaseUrl!);

  try {
    console.log('Adding slug, use_external_form, and external_form_url columns if they do not exist...');
    
    // Add columns if not exists
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS slug varchar(600);
    `;
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS use_external_form boolean NOT NULL DEFAULT false;
    `;
    await sql`
      ALTER TABLE events 
      ADD COLUMN IF NOT EXISTS external_form_url text;
    `;

    console.log('Fetching events to generate slugs...');
    const allEvents = await sql`SELECT id, title, slug FROM events`;
    console.log(`Found ${allEvents.length} events.`);

    for (const event of allEvents) {
      if (!event.slug) {
        const slug = generateEventSlug(event.title, event.id);
        console.log(`Generating slug for event ${event.id}: "${event.title}" -> "${slug}"`);
        await sql`
          UPDATE events
          SET slug = ${slug}
          WHERE id = ${event.id}
        `;
      } else {
        console.log(`Event ${event.id} already has slug: "${event.slug}"`);
      }
    }

    console.log('Adding UNIQUE constraint to slug column...');
    // Drop the constraint if it exists, to avoid errors if run multiple times.
    await sql`
      ALTER TABLE events DROP CONSTRAINT IF EXISTS events_slug_unique;
    `;
    await sql`
      ALTER TABLE events ADD CONSTRAINT events_slug_unique UNIQUE (slug);
    `;

    console.log('Migration and slug backfill completed successfully!');
  } catch (err) {
    console.error('Migration failed:', err);
  } finally {
    await sql.end();
  }
}

run();
