import 'dotenv/config';
import { db } from '../config/db';
import { users, executives, committeeSubmissions } from '../db/schema';
import { eq, inArray, and, notInArray } from 'drizzle-orm';
import { invalidate } from '../utils/cache';

async function cleanup() {
  console.log('🧹 Cleaning up static un-signed-up members from 2027 and 2027F...');

  // 1. Delete all static/non-registered executive entries from 2027 and 2027F (preserve MMU and C233122)
  const deletedExecs = await db
    .delete(executives)
    .where(
      and(
        inArray(executives.number, ['2027', '2027F']),
        notInArray(executives.id, ['MMU', 'C233122'])
      )
    )
    .returning({ id: executives.id, number: executives.number });
  console.log(`✅ Removed ${deletedExecs.length} static executives from 2027/2027F.`);

  // 2. Delete static submissions from 2027 and 2027F (preserve MMU and C233122)
  const deletedSubs = await db
    .delete(committeeSubmissions)
    .where(
      and(
        inArray(committeeSubmissions.committeeNumber, ['2027', '2027F']),
        notInArray(committeeSubmissions.matrixId, ['MMU', 'C233122'])
      )
    )
    .returning({ id: committeeSubmissions.id, matrixId: committeeSubmissions.matrixId });
  console.log(`✅ Removed ${deletedSubs.length} static committee submissions.`);

  // 3. Delete dummy users created by the static seed (mustChangePassword = true, not MMU or C233122)
  const deletedUsers = await db
    .delete(users)
    .where(
      and(
        eq(users.mustChangePassword, true),
        notInArray(users.id, ['MMU', 'C233122'])
      )
    )
    .returning({ id: users.id, name: users.name });
  console.log(`✅ Removed ${deletedUsers.length} dummy user accounts created from static data.`);

  // 4. Invalidate all committee, dashboard, and user caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('users:');
  invalidate('president:');

  console.log('🎉 Database cleaned! Only real signed-up members remain.');
  process.exit(0);
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
