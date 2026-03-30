import 'dotenv/config';
import { db } from '../config/db';
import { positions, roles } from '../db/schema';
import { eq } from 'drizzle-orm';

async function main() {
  await db
    .insert(positions)
    .values({
      position: 'executive member',
      description: 'Executive member of the club',
    })
    .onConflictDoNothing();

  await db
    .insert(roles)
    .values({
      role: 'executive member',
      priority: 7,
      description: 'Executive member',
    })
    .onConflictDoUpdate({
      target: roles.role,
      set: {
        priority: 7,
        description: 'Executive member',
      },
    });

  const roleRow = await db.select().from(roles).where(eq(roles.role, 'executive member'));
  const positionRow = await db
    .select()
    .from(positions)
    .where(eq(positions.position, 'executive member'));

  console.log(
    JSON.stringify(
      {
        ensured: true,
        role: roleRow[0] ?? null,
        position: positionRow[0] ?? null,
      },
      null,
      2,
    ),
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => process.exit(0));
