import { db } from '../../config/db';
import { committee, executives, roles, users } from '../../db/schema';
import { and, gte, lte, asc, eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { cached } from '../../utils/cache';

export const getRolesByPriorityRange = async (from: number, to: number): Promise<string[]> => {
  if (from > to) {
    throw new HTTPException(400, {
      message: "'from' must be less than or equal to 'to'",
    });
  }

  return cached(`roles:${from}:${to}`, 10 * 60_000, async () => {
    const result = await db
      .select({ role: roles.role })
      .from(roles)
      .where(and(gte(roles.priority, from), lte(roles.priority, to)))
      .orderBy(asc(roles.priority));

    return result.map((r) => r.role);
  });
};

export const assertCommitteeOpen = async (number: string) => {
  const [comm] = await db
    .select({ end: committee.end })
    .from(committee)
    .where(eq(committee.number, number));

  if (!comm) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  if (comm.end) {
    throw new HTTPException(403, {
      message: 'This committee is closed. No new actions can be performed.',
    });
  }
};

export const genderMatch = async (id: string, number: string) => {
  // 🔹 Get user gender
  const [user] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, id.toUpperCase()));

  if (!user) {
    throw new HTTPException(404, {
      message: 'User not found',
    });
  }

  // 🔹 Get committee gender
  const [comm] = await db
    .select({ gender: committee.gender })
    .from(committee)
    .where(eq(committee.number, number));

  if (!comm) {
    throw new HTTPException(404, {
      message: 'Committee not found',
    });
  }

  // 🔹 Compare genders
  if (user.gender !== comm.gender) {
    throw new HTTPException(403, {
      message: `This committee is only for ${comm.gender} members/ Gender doesn't match user's gender`,
    });
  }

  return true;
};

/**
 * Prevent assigning a user to a role if they already hold an equal or higher-priority
 * role in the same committee. Lower priority number = higher privilege.
 */
export const assertNoHigherRole = async (id: string, number: string, targetRoleName: string) => {
  // Get the user's current role in this committee
  const [existing] = await db
    .select({ role: executives.role })
    .from(executives)
    .where(and(eq(executives.id, id.toUpperCase()), eq(executives.number, number)));

  if (!existing || !existing.role) return; // no existing role — ok

  // Get priority of current role
  const [currentRole] = await db
    .select({ priority: roles.priority })
    .from(roles)
    .where(eq(roles.role, existing.role));

  // Get priority of target role
  const [targetRole] = await db
    .select({ priority: roles.priority })
    .from(roles)
    .where(eq(roles.role, targetRoleName));

  if (!currentRole || !targetRole) return; // role not found in DB — skip

  if (currentRole.priority <= targetRole.priority) {
    throw new HTTPException(409, {
      message: `User ${id} already holds "${existing.role}" (priority ${currentRole.priority}) in this committee. Cannot assign to "${targetRoleName}" (priority ${targetRole.priority}).`,
    });
  }
};
