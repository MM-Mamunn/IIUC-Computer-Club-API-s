import { db } from '../../config/db';
import { users, executives, committee } from '../../db/schema';
import { events, eventRegistrations } from '../../db/event.schema';
import { eq, ilike, or, count, isNull, sql } from 'drizzle-orm';

// ─── Search Users ───
export const searchUsers = async (query: string) => {
  const results = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      gender: users.gender,
      profileImage: users.profileImage,
    })
    .from(users)
    .where(
      or(
        ilike(users.id, `%${query}%`),
        ilike(users.name, `%${query}%`),
        ilike(users.email, `%${query}%`),
      ),
    )
    .limit(20);

  return results;
};

// ─── Get User by ID ───
export const getUserById = async (id: string) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      gender: users.gender,
      profileImage: users.profileImage,
      description: users.description,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, id));

  return user ?? null;
};

// ─── Dashboard Stats ───
export const getDashboardStats = async () => {
  const [userCount] = await db.select({ count: count() }).from(users);
  const [activeCommitteeCount] = await db
    .select({ count: count() })
    .from(committee)
    .where(isNull(committee.end));
  const [eventCount] = await db.select({ count: count() }).from(events);
  const [executiveCount] = await db.select({ count: count() }).from(executives);
  const [registrationCount] = await db.select({ count: count() }).from(eventRegistrations);

  return {
    totalUsers: userCount?.count ?? 0,
    activeCommittees: activeCommitteeCount?.count ?? 0,
    totalEvents: eventCount?.count ?? 0,
    totalExecutives: executiveCount?.count ?? 0,
    totalRegistrations: registrationCount?.count ?? 0,
  };
};
