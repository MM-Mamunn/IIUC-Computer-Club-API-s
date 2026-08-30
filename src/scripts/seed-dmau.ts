import 'dotenv/config';
import { db } from '../config/db';
import { users, committee, executives } from '../db/schema';
import { events } from '../db/event.schema';
import { hashPassword } from '../utils/hash';
import { eq, and, or } from 'drizzle-orm';
import { invalidate } from '../utils/cache';

async function seedDMAU() {
  console.log('🌱 Seeding DMAU President Account...');

  // 1. Insert/Update DMAU user account
  const hashedPassword = await hashPassword('DMAU');
  await db
    .insert(users)
    .values({
      id: 'DMAU',
      name: 'Dr Mohammad Aman Ullah',
      gender: 'male',
      email: 'aman@iiuc.ac.bd',
      password: hashedPassword,
      description: 'Chairman & Associate Professor, Dept. of CSE',
      department: 'CSE',
    })
    .onConflictDoUpdate({
      target: users.id,
      set: {
        name: 'Dr Mohammad Aman Ullah',
        gender: 'male',
        email: 'aman@iiuc.ac.bd',
        password: hashedPassword,
        description: 'Chairman & Associate Professor, Dept. of CSE',
        department: 'CSE',
      },
    });
  console.log('  ✅ DMAU account seeded successfully (password = DMAU)');

  // 2. Clean up test committee Spring 2026 if present
  await db
    .update(events)
    .set({ committeeNumber: '2026' })
    .where(eq(events.committeeNumber, 'Spring 2026'));

  await db
    .delete(executives)
    .where(
      or(
        eq(executives.number, 'Spring 2026'),
        eq(executives.number, 'Spring 2026 Female'),
      ),
    );

  await db
    .delete(committee)
    .where(
      or(
        eq(committee.number, 'Spring 2026'),
        eq(committee.number, 'Spring 2026 Female'),
      ),
    );

  // 3. Ensure 2026 & 2026F are the active committees
  await db
    .update(committee)
    .set({
      end: null,
      session: 'Autumn 2025 - Spring 2026',
      description: 'IIUC Computer Club Committee 2026 (Male)',
    })
    .where(eq(committee.number, '2026'));

  await db
    .update(committee)
    .set({
      end: null,
      session: 'Autumn 2025 - Spring 2026',
      description: 'IIUC Computer Club Committee 2026 (Female)',
    })
    .where(eq(committee.number, '2026F'));
  console.log('  ✅ Committee 2026 / 2026F set as current active committee');

  // 4. Assign DMAU as President of both active 2026 and 2026F committees
  await db
    .delete(executives)
    .where(
      and(
        or(eq(executives.number, '2026'), eq(executives.number, '2026F')),
        eq(executives.role, 'president'),
      ),
    );

  await db.insert(executives).values([
    {
      id: 'DMAU',
      number: '2026',
      role: 'president',
      position: 'president',
      assignedBy: 'DMAU',
    },
    {
      id: 'DMAU',
      number: '2026F',
      role: 'president',
      position: 'president',
      assignedBy: 'DMAU',
    },
  ]);
  console.log('  ✅ DMAU assigned as President of active committees 2026 and 2026F');

  // 5. Update assignedBy for committee 2026 / 2026F executives
  await db
    .update(executives)
    .set({ assignedBy: 'DMAU' })
    .where(eq(executives.number, '2026'));

  await db
    .update(executives)
    .set({ assignedBy: 'DMAU' })
    .where(eq(executives.number, '2026F'));

  // 6. Update events createdBy
  await db
    .update(events)
    .set({ createdBy: 'DMAU' })
    .where(eq(events.committeeNumber, '2026'));
  console.log('  ✅ Committee 2026 executives and events assigned to DMAU');

  // 7. Clear application caches
  invalidate();
  console.log('  ✅ Caches cleared');

  console.log('\n🎉 DMAU seed complete! Current active committee is presided by DMAU.');
  process.exit(0);
}

seedDMAU().catch((err) => {
  console.error('❌ Failed to seed DMAU:', err);
  process.exit(1);
});
