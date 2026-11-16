import crypto from 'crypto';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../config/db';
import { committee, executives, users } from '../db/schema';
import { cached } from './cache';
import { generateToken } from './jwt';

/** Short fingerprint of a password hash. It changes whenever the password does. */
export const passwordVersion = (passwordHash: string) =>
  crypto.createHash('sha256').update(passwordHash).digest('hex').slice(0, 16);

/** However often a session is refreshed, it ends this long after the password was entered */
export const MAX_SESSION_AGE_SECONDS = 30 * 24 * 60 * 60;

/**
 * Claims every login token carries: `pwv` ties it to the current password, so
 * a password change ends other sessions at their next refresh; `authTime` is
 * when the password was entered, kept across refreshes.
 */
export const sessionClaims = (passwordHash: string, authTime?: number) => ({
  pwv: passwordVersion(passwordHash),
  authTime: authTime ?? Math.floor(Date.now() / 1000),
});

// 'committee:' prefix so every committee cache invalidation clears it too
const activeCommitteeNumbers = () =>
  cached('committee:active-numbers', 60_000, async () => {
    const rows = await db
      .select({ number: committee.number })
      .from(committee)
      .where(and(isNull(committee.end), eq(committee.isActive, true)));
    return rows.map((r) => r.number);
  });

/**
 * Issue a login token for a user, with the role and position read from the
 * executives table. Every code path that logs someone in goes through here, so
 * a role can only come from the database, never from what a request claims.
 */
export const issueSessionToken = async (userId: string, authTime?: number) => {
  const [user] = await db
    .select({
      id: users.id,
      gender: users.gender,
      mustChangePassword: users.mustChangePassword,
      password: users.password,
    })
    .from(users)
    .where(eq(users.id, userId));

  if (!user) {
    throw new HTTPException(401, { message: 'User not found' });
  }

  const activeNumbers = await activeCommitteeNumbers();

  const [pos] = activeNumbers.length
    ? await db
        .select()
        .from(executives)
        .where(and(eq(executives.id, user.id), inArray(executives.number, activeNumbers)))
    : [];

  let role = pos?.role ?? 'student';
  let position = pos?.position ?? '';
  let committeeNumber = pos?.number ?? '';

  if (!pos) {
    const [latestPresident] = await db
      .select({ position: executives.position, number: executives.number })
      .from(executives)
      .where(and(eq(executives.id, user.id), eq(executives.role, 'president')))
      .orderBy(desc(executives.number))
      .limit(1);

    if (latestPresident) {
      role = 'president';
      position = latestPresident.position ?? '';
      committeeNumber = latestPresident.number;
    } else if (user.id === 'MMU') {
      role = 'president';
      position = 'president';
    }
  }

  return generateToken({
    id: user.id,
    role,
    position,
    gender: user.gender,
    committeeNumber,
    mustChangePassword: user.mustChangePassword ?? false,
    ...sessionClaims(user.password, authTime),
  });
};
