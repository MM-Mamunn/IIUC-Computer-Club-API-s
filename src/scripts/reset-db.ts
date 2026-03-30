/**
 * Reset Database — drops all data from every table (respects FK order).
 * Usage: bun run src/scripts/reset-db.ts
 */
import 'dotenv/config';
import { db } from '../config/db';
import { sql } from 'drizzle-orm';

async function resetDatabase() {
  console.log('⚠️  Clearing all tables...\n');

  // Disable FK checks temporarily, truncate everything, re-enable
  await db.execute(sql`
    TRUNCATE TABLE
      vouchers,
      expense_claims,
      event_expenses,
      event_managers,
      event_duties,
      event_registrations,
      events,
      executives,
      users,
      committee,
      role,
      position
    CASCADE
  `);

  console.log('✅ All tables cleared successfully.');
  process.exit(0);
}

resetDatabase().catch((err) => {
  console.error('❌ Reset failed:', err);
  process.exit(1);
});
