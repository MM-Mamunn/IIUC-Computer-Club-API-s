// committee.service.ts
import type { Context } from 'hono';
import { db } from '../../config/db';
import { committee, executives, users } from '../../db/schema';
import { HTTPException } from 'hono/http-exception';
import { and, eq, isNull, isNotNull, desc, or } from 'drizzle-orm';
import { cached, invalidate } from '../../utils/cache';

export const addCommittee = async (
  number: string,
  start: string,
  session: string,
  beginningBudget: number,
  description: string | null,
) => {
  if (!number || !start || !session) {
    throw new HTTPException(400, {
      message: 'number, start, and session are required',
    });
  }
  if (isNaN(Date.parse(start))) {
    throw new HTTPException(400, {
      message: 'Invalid start date format',
    });
  }
  if (
    typeof beginningBudget !== 'number' ||
    !Number.isFinite(beginningBudget) ||
    beginningBudget <= 0
  ) {
    throw new HTTPException(400, {
      message: 'beginningBudget is required and must be a positive number',
    });
  }

  const femaleNumber = `${number}F`;

  // Check if any active committee already exists for either gender
  const activeCommittees = await db
    .select()
    .from(committee)
    .where(
      and(isNull(committee.end), or(eq(committee.gender, 'male'), eq(committee.gender, 'female'))),
    )
    .limit(1);

  if (activeCommittees.length > 0) {
    throw new HTTPException(409, {
      message: 'Active committees already exist. You must close them first.',
    });
  }

  // Check by committee number existence (both male and female)
  const existing = await db
    .select()
    .from(committee)
    .where(or(eq(committee.number, number), eq(committee.number, femaleNumber)))
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: `Committee ${existing[0].number} already exists`,
    });
  }

  // Insert both committees
  const [maleCommittee] = await db
    .insert(committee)
    .values({
      number,
      start,
      session,
      gender: 'male',
      end: null,
      beginningBudget,
      description: description ?? null,
    })
    .returning();

  await db.insert(committee).values({
    number: femaleNumber,
    start,
    session,
    gender: 'female',
    end: null,
    beginningBudget: null,
    description: description ?? null,
  });

  // Invalidate committee + dashboard caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('president:');

  return maleCommittee;
};

export const showActive = () =>
  cached('committee:active', 60_000, async () => {
    return db
      .select({
        number: committee.number,
        gender: committee.gender,
        start: committee.start,
        session: committee.session,
        end: committee.end,
        description: committee.description,
        beginningBudget: committee.beginningBudget,
      })
      .from(committee)
      .where(isNull(committee.end));
  });

export const showPositions = async (number: string, c: Context) => {
  const poss = await db
    .selectDistinct({ position: executives.position })
    .from(executives)
    .where(eq(executives.number, number));
  return poss;
};

// ─── Show All Committees (cached 60s) ───
export const showAllCommittees = () =>
  cached('committee:all', 60_000, async () => {
    return db
      .select({
        number: committee.number,
        gender: committee.gender,
        start: committee.start,
        session: committee.session,
        end: committee.end,
        description: committee.description,
        beginningBudget: committee.beginningBudget,
      })
      .from(committee)
      .orderBy(desc(committee.start));
  });

// ─── Close Committee ───
export const closeCommittee = async (number: string, endDate: string) => {
  const [existing] = await db.select().from(committee).where(eq(committee.number, number));

  if (!existing) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  if (existing.end) {
    throw new HTTPException(400, { message: 'Committee is already closed' });
  }

  if (!endDate || isNaN(Date.parse(endDate))) {
    throw new HTTPException(400, { message: 'Valid end date is required' });
  }

  // Close this committee
  const [updated] = await db
    .update(committee)
    .set({ end: endDate })
    .where(eq(committee.number, number))
    .returning();

  // Also close the sibling committee (male ↔ female)
  const siblingNumber =
    existing.gender === 'male' ? `${number}F` : number.endsWith('F') ? number.slice(0, -1) : null;

  if (siblingNumber) {
    const [sibling] = await db.select().from(committee).where(eq(committee.number, siblingNumber));
    if (sibling && !sibling.end) {
      await db.update(committee).set({ end: endDate }).where(eq(committee.number, siblingNumber));
    }
  }

  // Invalidate committee + dashboard caches
  invalidate('committee:');
  invalidate('dashboard:');
  invalidate('president:');

  return updated;
};

// ─── Show Committee Members (cached 60s) ───
export const showMembers = async (number: string) => {
  const [com] = await db.select().from(committee).where(eq(committee.number, number));

  if (!com) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  return cached(`committee:members:${number}`, 60_000, async () => {
    return db
      .select({
        id: executives.id,
        name: users.name,
        email: users.email,
        gender: users.gender,
        profileImage: users.profileImage,
        role: executives.role,
        position: executives.position,
      })
      .from(executives)
      .innerJoin(users, eq(executives.id, users.id))
      .where(eq(executives.number, number));
  });
};
