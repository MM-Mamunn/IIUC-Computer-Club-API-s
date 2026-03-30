import { db } from '../../config/db';
import { users, executives, committee } from '../../db/schema';
import { roles as rolesTable } from '../../db/schema';
import { events, eventRegistrations, eventExpenses, vouchers } from '../../db/event.schema';
import { eq, and, ilike, or, count, isNull, sum, inArray } from 'drizzle-orm';
import { cached } from '../../utils/cache';

// ─── Search Users ───
export const searchUsers = async (query: string, committeeNumber?: string, callerRole?: string, executivesOnly?: boolean) => {
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

  // Fetch role priorities for filtering
  const rolePriorities = await db
    .select({ role: rolesTable.role, priority: rolesTable.priority })
    .from(rolesTable);
  const priorityMap = new Map(rolePriorities.map((r) => [r.role, r.priority]));

  // Get caller's role priority for filtering
  const callerPriority = callerRole ? (priorityMap.get(callerRole) ?? Infinity) : Infinity;

  const userIds = results.map((r) => r.id);

  // Fetch ALL executive roles for matched users (across all active committees)
  // to filter out users with equal or higher roles
  let execByUser = new Map<
    string,
    { role: string | null; position: string | null; committeeNumber: string }[]
  >();
  if (userIds.length > 0) {
    // Get active committee numbers
    const activeComms = await db
      .select({ number: committee.number })
      .from(committee)
      .where(isNull(committee.end));
    const activeNumbers = activeComms.map((c) => c.number);

    if (activeNumbers.length > 0) {
      const allExecRoles = await db
        .select({
          id: executives.id,
          role: executives.role,
          position: executives.position,
          number: executives.number,
        })
        .from(executives)
        .where(and(inArray(executives.id, userIds), inArray(executives.number, activeNumbers)));

      for (const e of allExecRoles) {
        const arr = execByUser.get(e.id) || [];
        arr.push({ role: e.role, position: e.position, committeeNumber: e.number });
        execByUser.set(e.id, arr);
      }
    }
  }

  // Filter out users who hold a role with priority <= caller's priority in ANY active committee
  let filteredResults = results;
  if (callerRole && callerPriority < Infinity) {
    filteredResults = results.filter((u) => {
      const execRoles = execByUser.get(u.id);
      if (!execRoles || execRoles.length === 0) return true; // no role = eligible
      // Check if ANY of their roles has priority <= caller's priority
      const hasHigherOrEqualRole = execRoles.some((e) => {
        if (!e.role) return false;
        const p = priorityMap.get(e.role);
        return p != null && p <= callerPriority;
      });
      return !hasHigherOrEqualRole;
    });
  }

  // If executivesOnly is true, filter out users who are NOT in any active committee
  if (executivesOnly) {
    filteredResults = filteredResults.filter((u) => {
      const execRoles = execByUser.get(u.id);
      return execRoles && execRoles.length > 0;
    });
  }

  // If a committee number is provided, attach the user's role in THAT committee
  if (committeeNumber) {
    return filteredResults.map((u) => {
      const execRoles = execByUser.get(u.id);
      const committeeExec = execRoles?.find((e) => e.committeeNumber === committeeNumber);
      return {
        ...u,
        currentRole: committeeExec?.role ?? null,
        currentPosition: committeeExec?.position ?? null,
        rolePriority: committeeExec?.role ? (priorityMap.get(committeeExec.role) ?? null) : null,
      };
    });
  }

  return filteredResults.map((u) => ({
    ...u,
    currentRole: null as string | null,
    currentPosition: null as string | null,
    rolePriority: null as number | null,
  }));
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
    .where(eq(users.id, id.toUpperCase()));

  return user ?? null;
};

// ─── Dashboard Stats (cached 30s) ───
export const getDashboardStats = () =>
  cached('dashboard:stats', 30_000, async () => {
    const [
      [userCount],
      [activeCommitteeCount],
      [eventCount],
      [executiveCount],
      [registrationCount],
    ] = await Promise.all([
      db.select({ count: count() }).from(users),
      db.select({ count: count() }).from(committee).where(isNull(committee.end)),
      db.select({ count: count() }).from(events),
      db.select({ count: count() }).from(executives),
      db.select({ count: count() }).from(eventRegistrations),
    ]);

    return {
      totalUsers: userCount?.count ?? 0,
      activeCommittees: activeCommitteeCount?.count ?? 0,
      totalEvents: eventCount?.count ?? 0,
      totalExecutives: executiveCount?.count ?? 0,
      totalRegistrations: registrationCount?.count ?? 0,
    };
  });

// ─── Budget Overview Stats — scoped to active committees (cached 30s) ───
export const getBudgetStats = (committeeNumber?: string) =>
  cached(`dashboard:budget:${committeeNumber ?? 'all'}`, 30_000, async () => {
    // Find active committee numbers
    const activeComms = await db
      .select({
        number: committee.number,
        gender: committee.gender,
        budget: committee.beginningBudget,
      })
      .from(committee)
      .where(isNull(committee.end));

    // If no active committees → clean reset, all zeros
    if (activeComms.length === 0) {
      return {
        totalBudget: 0,
        totalExpenses: 0,
        totalRevenue: 0,
        totalSubsidy: 0,
        remainingBudget: 0,
        totalVouchers: 0,
        siblingExpenses: 0,
        siblingCommittee: null as string | null,
      };
    }

    const totalBudget = activeComms.reduce((s, c) => s + Number(c.budget ?? 0), 0);
    const activeNumbers = activeComms.map((c) => c.number);

    // Get event IDs belonging to active committees
    const activeEvents = await db
      .select({
        id: events.id,
        isPaid: events.isPaid,
        fee: events.fee,
        committeeNumber: events.committeeNumber,
      })
      .from(events)
      .where(inArray(events.committeeNumber, activeNumbers));

    if (activeEvents.length === 0) {
      // Determine sibling info even with no events
      let siblingCommittee: string | null = null;
      if (committeeNumber) {
        const myComm = activeComms.find((c) => c.number === committeeNumber);
        if (myComm) {
          const siblingNumber =
            myComm.gender === 'male'
              ? `${committeeNumber}F`
              : committeeNumber.endsWith('F')
                ? committeeNumber.slice(0, -1)
                : null;
          if (siblingNumber && activeComms.some((c) => c.number === siblingNumber)) {
            siblingCommittee = siblingNumber;
          }
        }
      }
      return {
        totalBudget,
        totalExpenses: 0,
        totalRevenue: 0,
        totalSubsidy: 0,
        remainingBudget: totalBudget,
        totalVouchers: 0,
        siblingExpenses: 0,
        siblingCommittee,
      };
    }

    const activeEventIds = activeEvents.map((e) => e.id);

    // All financial queries scoped to active events, in parallel
    const [[expenseResult], revenueRows, [voucherCount]] = await Promise.all([
      db
        .select({ total: sum(eventExpenses.amount) })
        .from(eventExpenses)
        .where(inArray(eventExpenses.eventId, activeEventIds)),
      db
        .select({ fee: events.fee, count: count() })
        .from(eventRegistrations)
        .innerJoin(events, eq(eventRegistrations.eventId, events.id))
        .where(
          and(
            eq(eventRegistrations.paymentStatus, 'verified'),
            eq(events.isPaid, true),
            inArray(events.id, activeEventIds),
          ),
        )
        .groupBy(events.fee),
      db.select({ count: count() }).from(vouchers).where(inArray(vouchers.eventId, activeEventIds)),
    ]);

    const totalExpenses = Number(expenseResult?.total ?? 0);

    let totalRevenue = 0;
    for (const row of revenueRows) {
      totalRevenue += (row.fee ?? 0) * row.count;
    }

    const totalSubsidy = Math.max(0, totalExpenses - totalRevenue);
    const remainingBudget = totalBudget - totalSubsidy;

    // Calculate sibling committee expenses
    let siblingExpenses = 0;
    let siblingCommittee: string | null = null;
    if (committeeNumber) {
      const myComm = activeComms.find((c) => c.number === committeeNumber);
      if (myComm) {
        const siblingNumber =
          myComm.gender === 'male'
            ? `${committeeNumber}F`
            : committeeNumber.endsWith('F')
              ? committeeNumber.slice(0, -1)
              : null;
        if (siblingNumber && activeComms.some((c) => c.number === siblingNumber)) {
          siblingCommittee = siblingNumber;
          const siblingEventIds = activeEvents
            .filter((e) => e.committeeNumber === siblingNumber)
            .map((e) => e.id);
          if (siblingEventIds.length > 0) {
            // Get sibling expenses and revenue to calculate sibling subsidy
            const [[sibExpResult], sibRevRows] = await Promise.all([
              db
                .select({ total: sum(eventExpenses.amount) })
                .from(eventExpenses)
                .where(inArray(eventExpenses.eventId, siblingEventIds)),
              db
                .select({ fee: events.fee, count: count() })
                .from(eventRegistrations)
                .innerJoin(events, eq(eventRegistrations.eventId, events.id))
                .where(
                  and(
                    eq(eventRegistrations.paymentStatus, 'verified'),
                    eq(events.isPaid, true),
                    inArray(events.id, siblingEventIds),
                  ),
                )
                .groupBy(events.fee),
            ]);
            const sibExp = Number(sibExpResult?.total ?? 0);
            let sibRev = 0;
            for (const row of sibRevRows) {
              sibRev += (row.fee ?? 0) * row.count;
            }
            siblingExpenses = Math.max(0, sibExp - sibRev);
          }
        }
      }
    }

    return {
      totalBudget,
      totalExpenses,
      totalRevenue,
      totalSubsidy,
      remainingBudget,
      totalVouchers: voucherCount?.count ?? 0,
      siblingExpenses,
      siblingCommittee,
    };
  });
