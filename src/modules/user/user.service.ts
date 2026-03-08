import { db } from '../../config/db';
import { users, executives, committee } from '../../db/schema';
import { events, eventRegistrations, eventExpenses, vouchers } from '../../db/event.schema';
import { eq, ilike, or, count, isNull, sql, sum } from 'drizzle-orm';

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

// ─── Budget Overview Stats (president/treasurer) ───
export const getBudgetStats = async () => {
  // Total beginning budget across all active committees
  const [budgetResult] = await db
    .select({ total: sum(committee.beginningBudget) })
    .from(committee)
    .where(isNull(committee.end));
  const totalBudget = Number(budgetResult?.total ?? 0);

  // Total expenses across all events
  const [expenseResult] = await db.select({ total: sum(eventExpenses.amount) }).from(eventExpenses);
  const totalExpenses = Number(expenseResult?.total ?? 0);

  // Total revenue from verified paid registrations
  const revenueRows = await db
    .select({
      fee: events.fee,
      count: count(),
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(sql`${eventRegistrations.paymentStatus} = 'verified' AND ${events.isPaid} = true`)
    .groupBy(events.fee);

  let totalRevenue = 0;
  for (const row of revenueRows) {
    totalRevenue += (row.fee ?? 0) * row.count;
  }

  // Total subsidized = total expenses - total revenue (if positive)
  const totalSubsidy = Math.max(0, totalExpenses - totalRevenue);

  // Remaining budget
  const remainingBudget = totalBudget - totalSubsidy;

  // Voucher count
  const [voucherCount] = await db.select({ count: count() }).from(vouchers);

  return {
    totalBudget,
    totalExpenses,
    totalRevenue,
    totalSubsidy,
    remainingBudget,
    totalVouchers: voucherCount?.count ?? 0,
  };
};
