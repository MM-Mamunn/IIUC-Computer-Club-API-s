// committee.service.ts
import type { Context } from 'hono';
import { db } from '../../config/db';
import { committee, executives, users } from '../../db/schema';
import { HTTPException } from 'hono/http-exception';
import { and, eq, isNull, isNotNull, desc } from 'drizzle-orm';
import { genderMatch } from '../global/global.service';
// import { positions } from "./committee.controller";

export const addCommittee = async (
  number: string,
  start: string,
  gender: string,
  end: string | null, // accept null from controller
  beginningBudget: number | null, // accept number | null
  description: string | null, // accept string | null
  c: Context,
) => {
  if (!number || !start || !gender) {
    throw new HTTPException(400, {
      message: 'number, start and gender are required',
    });
  }
  const user = c.get('user');
  if ((await genderMatch(user.id, number)) === false) {
    throw new HTTPException(403, {
      message: 'You cannot create a committee for a different gender',
    });
  }
  if (isNaN(Date.parse(start))) {
    throw new HTTPException(400, {
      message: 'Invalid start date format',
    });
  }

  if (end && isNaN(Date.parse(end))) {
    throw new HTTPException(400, {
      message: 'Invalid end date format',
    });
  }

  if (end && new Date(end) < new Date(start)) {
    throw new HTTPException(400, {
      message: 'End date cannot be before start date',
    });
  }

  // validate beginningBudget if provided (must be finite number)
  if (beginningBudget !== null && beginningBudget !== undefined) {
    if (typeof beginningBudget !== 'number' || !Number.isFinite(beginningBudget)) {
      throw new HTTPException(400, {
        message: 'beginningBudget must be a valid number',
      });
    }
  }

  // Check if an active committee (end IS NULL) exists for same gender
  const activeCommittee = await db
    .select()
    .from(committee)
    .where(and(eq(committee.gender, gender), isNull(committee.end)))
    .limit(1);

  if (activeCommittee.length > 0) {
    throw new HTTPException(409, {
      message: `An active committee for gender '${gender}' already exists. You must close it first.`,
    });
  }

  // Check by committee number existence
  const existing = await db.select().from(committee).where(eq(committee.number, number)).limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: `Committee ${number} already exists`,
    });
  }

  // Insert new committee
  const [newCommittee] = await db
    .insert(committee)
    .values({
      number,
      start,
      gender,
      end: end ?? null,
      beginningBudget: beginningBudget ?? null,
      description: description ?? null,
    })
    .returning();

  return newCommittee;
};

export const showActive = async () => {
  const activeCommittees = await db
    .select({
      number: committee.number,
      gender: committee.gender,
      start: committee.start,
      end: committee.end,
      description: committee.description,
      beginningBudget: committee.beginningBudget,
    })
    .from(committee)
    .where(isNull(committee.end));

  return activeCommittees;
};

export const showPositions = async (number: string, c: Context) => {
  const poss = await db
    .selectDistinct({ position: executives.position })
    .from(executives)
    .where(eq(executives.number, number));
  return poss;
};

// ─── Show All Committees ───
export const showAllCommittees = async () => {
  const all = await db
    .select({
      number: committee.number,
      gender: committee.gender,
      start: committee.start,
      end: committee.end,
      description: committee.description,
      beginningBudget: committee.beginningBudget,
    })
    .from(committee)
    .orderBy(desc(committee.start));

  return all;
};

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

  const [updated] = await db
    .update(committee)
    .set({ end: endDate })
    .where(eq(committee.number, number))
    .returning();

  return updated;
};

// ─── Show Committee Members ───
export const showMembers = async (number: string) => {
  const [com] = await db.select().from(committee).where(eq(committee.number, number));

  if (!com) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  const members = await db
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

  return members;
};
