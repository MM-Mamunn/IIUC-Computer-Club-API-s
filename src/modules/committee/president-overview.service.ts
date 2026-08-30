import { db } from '../../config/db';
import { committee, executives, users } from '../../db/schema';
import {
  events,
  eventRegistrations,
  eventExpenses,
  expenseClaims,
  vouchers,
} from '../../db/event.schema';
import { eq, and, isNull, desc, asc, sql, or, lte, gte, inArray } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { cached } from '../../utils/cache';

// ─── Get all committees (cached 60s) ───
export const getAllCommitteesForPresident = (userId?: string) =>
  cached(`committee:president:list:${userId ?? 'all'}`, 60_000, async () => {
    if (userId === 'DMAU') {
      const presComms = await db
        .select({ number: executives.number })
        .from(executives)
        .where(and(eq(executives.id, 'DMAU'), eq(executives.role, 'president')));
      const validNumbers = presComms.map((c) => c.number);
      if (validNumbers.length === 0) return [];

      return db
        .select({
          number: committee.number,
          gender: committee.gender,
          start: committee.start,
          end: committee.end,
          beginningBudget: committee.beginningBudget,
          description: committee.description,
        })
        .from(committee)
        .where(inArray(committee.number, validNumbers))
        .orderBy(asc(committee.end), desc(committee.start));
    }

    return db
      .select({
        number: committee.number,
        gender: committee.gender,
        start: committee.start,
        end: committee.end,
        beginningBudget: committee.beginningBudget,
        description: committee.description,
      })
      .from(committee)
      .orderBy(asc(committee.end), desc(committee.start));
  });

// ─── Get full financial overview — parallel queries for <1s response ───
export const getCommitteeOverview = async (committeeNumber: string, userId?: string) => {
  if (userId === 'DMAU') {
    const isPres = await db
      .select()
      .from(executives)
      .where(
        and(
          eq(executives.id, 'DMAU'),
          eq(executives.number, committeeNumber),
          eq(executives.role, 'president'),
        ),
      );
    if (isPres.length === 0) {
      throw new HTTPException(403, {
        message: 'You can only view overviews for sessions where you were the president.',
      });
    }
  }

  // Phase 1: committee + events in parallel
  const [[comm], committeeEvents] = await Promise.all([
    db.select().from(committee).where(eq(committee.number, committeeNumber)),
    db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        eventDate: events.eventDate,
        venue: events.venue,
        isPaid: events.isPaid,
        fee: events.fee,
        bannerImage: events.bannerImage,
        status: events.status,
        estimatedBudget: events.estimatedBudget,
        allocatedBudget: events.allocatedBudget,
        financesLocked: events.financesLocked,
        genderRestriction: events.genderRestriction,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(eq(events.committeeNumber, committeeNumber))
      .orderBy(desc(events.eventDate)),
  ]);

  if (!comm) {
    throw new HTTPException(404, { message: 'Committee not found' });
  }

  const eventIds = committeeEvents.map((e) => e.id);
  const hasEvents = eventIds.length > 0;

  // Phase 2: ALL remaining queries fire in parallel (6 queries at once)
  const [sessionBudget, regRows, expRows, claimRows, voucherRows, members] = await Promise.all([
    getSessionBudget(comm),
    hasEvents
      ? db
          .select({
            eventId: eventRegistrations.eventId,
            total: sql<number>`count(*)`.as('total'),
            verified:
              sql<number>`count(*) filter (where ${eventRegistrations.paymentStatus} = 'verified')`.as(
                'verified',
              ),
          })
          .from(eventRegistrations)
          .where(inArray(eventRegistrations.eventId, eventIds))
          .groupBy(eventRegistrations.eventId)
      : ([] as { eventId: number; total: number; verified: number }[]),
    hasEvents
      ? db
          .select({
            eventId: eventExpenses.eventId,
            total: sql<number>`coalesce(sum(${eventExpenses.amount}), 0)`.as('total'),
          })
          .from(eventExpenses)
          .where(inArray(eventExpenses.eventId, eventIds))
          .groupBy(eventExpenses.eventId)
      : ([] as { eventId: number; total: number }[]),
    hasEvents
      ? db
          .select({
            eventId: expenseClaims.eventId,
            status: expenseClaims.status,
            count: sql<number>`count(*)`.as('cnt'),
            total: sql<number>`coalesce(sum(${expenseClaims.amount}), 0)`.as('total'),
          })
          .from(expenseClaims)
          .where(
            and(
              inArray(expenseClaims.eventId, eventIds),
              inArray(expenseClaims.status, ['pending', 'approved']),
            ),
          )
          .groupBy(expenseClaims.eventId, expenseClaims.status)
      : ([] as { eventId: number; status: string; count: number; total: number }[]),
    hasEvents
      ? db
          .select({ eventId: vouchers.eventId, voucherNumber: vouchers.voucherNumber })
          .from(vouchers)
          .where(inArray(vouchers.eventId, eventIds))
      : ([] as { eventId: number; voucherNumber: string }[]),
    db
      .select({
        id: executives.id,
        name: users.name,
        email: users.email,
        gender: users.gender,
        profileImage: users.profileImage,
        role: executives.role,
        position: executives.position,
        bio: users.description,
        githubUrl: users.githubUrl,
        linkedinUrl: users.linkedinUrl,
        facebookUrl: users.facebookUrl,
        twitterUrl: users.twitterUrl,
      })
      .from(executives)
      .innerJoin(users, eq(executives.id, users.id))
      .where(eq(executives.number, committeeNumber)),
  ]);

  // Build lookup maps from bulk results
  const regMap = new Map<number, { total: number; verified: number }>();
  for (const r of regRows)
    regMap.set(r.eventId, { total: Number(r.total), verified: Number(r.verified) });

  const expenseMap = new Map<number, number>();
  for (const r of expRows) expenseMap.set(r.eventId, Number(r.total));

  const pendingClaimsMap = new Map<number, { count: number; amount: number }>();
  const approvedClaimsMap = new Map<number, { count: number; amount: number }>();
  for (const r of claimRows) {
    const map = r.status === 'pending' ? pendingClaimsMap : approvedClaimsMap;
    map.set(r.eventId, { count: Number(r.count), amount: Number(r.total) });
  }

  const voucherMap = new Map<number, string>();
  for (const v of voucherRows) voucherMap.set(v.eventId, v.voucherNumber);

  // Build event summaries + accumulate grand totals
  let grandTotalRevenue = 0;
  let grandTotalExpense = 0;
  let grandTotalAllocatedBudget = 0;
  let grandTotalEstimatedBudget = 0;
  let totalRegistrations = 0;
  let totalVerifiedPayments = 0;

  const eventSummaries = committeeEvents.map((evt) => {
    const reg = regMap.get(evt.id) ?? { total: 0, verified: 0 };
    const eventExpenseTotal = expenseMap.get(evt.id) ?? 0;
    const pending = pendingClaimsMap.get(evt.id) ?? { count: 0, amount: 0 };
    const approved = approvedClaimsMap.get(evt.id) ?? { count: 0, amount: 0 };
    const eventRevenue = evt.isPaid ? reg.verified * (evt.fee ?? 0) : 0;
    const netAmount = eventRevenue - eventExpenseTotal;
    const clubSubsidy = Math.max(0, eventExpenseTotal - eventRevenue);

    grandTotalRevenue += eventRevenue;
    grandTotalExpense += eventExpenseTotal;
    grandTotalAllocatedBudget += evt.allocatedBudget ?? 0;
    grandTotalEstimatedBudget += evt.estimatedBudget ?? 0;
    totalRegistrations += reg.total;
    totalVerifiedPayments += reg.verified;

    return {
      id: evt.id,
      title: evt.title,
      description: evt.description,
      eventDate: evt.eventDate,
      venue: evt.venue,
      status: evt.status,
      isPaid: evt.isPaid,
      fee: evt.fee ?? 0,
      genderRestriction: evt.genderRestriction,
      bannerImage: evt.bannerImage,
      estimatedBudget: evt.estimatedBudget ?? 0,
      allocatedBudget: evt.allocatedBudget ?? 0,
      totalRegistrations: reg.total,
      verifiedPayments: reg.verified,
      totalRevenue: eventRevenue,
      totalExpense: eventExpenseTotal,
      netAmount,
      clubSubsidy,
      pendingClaims: pending.count,
      pendingClaimsAmount: pending.amount,
      approvedClaims: approved.count,
      approvedClaimsAmount: approved.amount,
      financesLocked: evt.financesLocked,
      voucherNumber: voucherMap.get(evt.id) ?? null,
      createdAt: evt.createdAt,
    };
  });

  const grandClubSubsidy = Math.max(0, grandTotalExpense - grandTotalRevenue);
  const grandNetAmount = grandTotalRevenue - grandTotalExpense;

  return {
    committee: {
      number: comm.number,
      gender: comm.gender,
      start: comm.start,
      end: comm.end,
      beginningBudget: sessionBudget,
      description: comm.description,
      isActive: !comm.end,
    },
    financials: {
      beginningBudget: sessionBudget,
      totalAllocatedBudget: grandTotalAllocatedBudget,
      totalEstimatedBudget: grandTotalEstimatedBudget,
      totalRevenue: grandTotalRevenue,
      totalExpense: grandTotalExpense,
      clubSubsidy: grandClubSubsidy,
      netAmount: grandNetAmount,
      remainingBudget: sessionBudget - grandClubSubsidy,
    },
    stats: {
      totalEvents: committeeEvents.length,
      totalRegistrations,
      totalVerifiedPayments,
    },
    events: eventSummaries,
    members,
  };
};

// ─── Helper: session budget (from the male committee) ───
const getSessionBudget = async (comm: {
  gender: string;
  start: string;
  end: string | null;
  beginningBudget: number | null;
}) => {
  if (comm.gender === 'male') return comm.beginningBudget ?? 0;

  const [maleComm] = await db
    .select({ beginningBudget: committee.beginningBudget })
    .from(committee)
    .where(
      and(
        eq(committee.gender, 'male'),
        lte(committee.start, comm.start),
        or(isNull(committee.end), gte(committee.end, comm.start)),
      ),
    )
    .limit(1);

  return maleComm?.beginningBudget ?? 0;
};

// ─── Get ALL committee overviews in a single call (cached 2min) ───
export const getAllOverviews = (userId?: string) =>
  cached(`president:all-overviews:${userId ?? 'all'}`, 120_000, async () => {
    // Get all committees
    let allCommitteesQuery = db
      .select({
        number: committee.number,
        gender: committee.gender,
        start: committee.start,
        end: committee.end,
        beginningBudget: committee.beginningBudget,
        description: committee.description,
      })
      .from(committee);

    if (userId === 'DMAU') {
      const presComms = await db
        .select({ number: executives.number })
        .from(executives)
        .where(and(eq(executives.id, 'DMAU'), eq(executives.role, 'president')));
      const validNumbers = presComms.map((c) => c.number);
      if (validNumbers.length === 0) return [];
      allCommitteesQuery = allCommitteesQuery.where(inArray(committee.number, validNumbers)) as any;
    }

    const allCommittees = await allCommitteesQuery.orderBy(asc(committee.end), desc(committee.start));

    if (allCommittees.length === 0) {
      return [];
    }

    const allNumbers = allCommittees.map((c) => c.number);

    // Get ALL events for ALL committees at once
    const allEvents = await db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        committeeNumber: events.committeeNumber,
        eventDate: events.eventDate,
        venue: events.venue,
        isPaid: events.isPaid,
        fee: events.fee,
        bannerImage: events.bannerImage,
        status: events.status,
        estimatedBudget: events.estimatedBudget,
        allocatedBudget: events.allocatedBudget,
        financesLocked: events.financesLocked,
        genderRestriction: events.genderRestriction,
        createdAt: events.createdAt,
      })
      .from(events)
      .where(inArray(events.committeeNumber, allNumbers))
      .orderBy(desc(events.eventDate));

    const allEventIds = allEvents.map((e) => e.id);
    const hasAnyEvents = allEventIds.length > 0;

    // All bulk queries in parallel
    const [regRows, expRows, claimRows, voucherRows, allMembers] = await Promise.all([
      hasAnyEvents
        ? db
            .select({
              eventId: eventRegistrations.eventId,
              total: sql<number>`count(*)`.as('total'),
              verified:
                sql<number>`count(*) filter (where ${eventRegistrations.paymentStatus} = 'verified')`.as(
                  'verified',
                ),
            })
            .from(eventRegistrations)
            .where(inArray(eventRegistrations.eventId, allEventIds))
            .groupBy(eventRegistrations.eventId)
        : ([] as { eventId: number; total: number; verified: number }[]),
      hasAnyEvents
        ? db
            .select({
              eventId: eventExpenses.eventId,
              total: sql<number>`coalesce(sum(${eventExpenses.amount}), 0)`.as('total'),
            })
            .from(eventExpenses)
            .where(inArray(eventExpenses.eventId, allEventIds))
            .groupBy(eventExpenses.eventId)
        : ([] as { eventId: number; total: number }[]),
      hasAnyEvents
        ? db
            .select({
              eventId: expenseClaims.eventId,
              status: expenseClaims.status,
              count: sql<number>`count(*)`.as('cnt'),
              total: sql<number>`coalesce(sum(${expenseClaims.amount}), 0)`.as('total'),
            })
            .from(expenseClaims)
            .where(
              and(
                inArray(expenseClaims.eventId, allEventIds),
                inArray(expenseClaims.status, ['pending', 'approved']),
              ),
            )
            .groupBy(expenseClaims.eventId, expenseClaims.status)
        : ([] as { eventId: number; status: string; count: number; total: number }[]),
      hasAnyEvents
        ? db
            .select({ eventId: vouchers.eventId, voucherNumber: vouchers.voucherNumber })
            .from(vouchers)
            .where(inArray(vouchers.eventId, allEventIds))
        : ([] as { eventId: number; voucherNumber: string }[]),
      db
        .select({
          id: executives.id,
          name: users.name,
          email: users.email,
          gender: users.gender,
          profileImage: users.profileImage,
          role: executives.role,
          position: executives.position,
          committeeNumber: executives.number,
        })
        .from(executives)
        .innerJoin(users, eq(executives.id, users.id))
        .where(inArray(executives.number, allNumbers)),
    ]);

    // Build global lookup maps
    const regMap = new Map<number, { total: number; verified: number }>();
    for (const r of regRows)
      regMap.set(r.eventId, { total: Number(r.total), verified: Number(r.verified) });

    const expenseMap = new Map<number, number>();
    for (const r of expRows) expenseMap.set(r.eventId, Number(r.total));

    const pendingClaimsMap = new Map<number, { count: number; amount: number }>();
    const approvedClaimsMap = new Map<number, { count: number; amount: number }>();
    for (const r of claimRows) {
      const map = r.status === 'pending' ? pendingClaimsMap : approvedClaimsMap;
      map.set(r.eventId, { count: Number(r.count), amount: Number(r.total) });
    }

    const voucherMap = new Map<number, string>();
    for (const v of voucherRows) voucherMap.set(v.eventId, v.voucherNumber);

    // Group events and members by committee number
    const eventsByCommittee = new Map<string, typeof allEvents>();
    for (const evt of allEvents) {
      const arr = eventsByCommittee.get(evt.committeeNumber) ?? [];
      arr.push(evt);
      eventsByCommittee.set(evt.committeeNumber, arr);
    }

    const membersByCommittee = new Map<string, typeof allMembers>();
    for (const m of allMembers) {
      const arr = membersByCommittee.get(m.committeeNumber) ?? [];
      arr.push(m);
      membersByCommittee.set(m.committeeNumber, arr);
    }

    // Build male budget lookup for female committees
    const maleBudgetMap = new Map<string, number>();
    for (const c of allCommittees) {
      if (c.gender === 'male' && c.beginningBudget != null) {
        maleBudgetMap.set(c.number, c.beginningBudget);
      }
    }

    // Build overview for each committee
    return allCommittees.map((comm) => {
      const committeeEvents = eventsByCommittee.get(comm.number) ?? [];
      const members = (membersByCommittee.get(comm.number) ?? []).map(
        ({ committeeNumber: _, ...rest }) => rest,
      );

      // Session budget: male uses own, female uses sibling male's
      let sessionBudget = 0;
      if (comm.gender === 'male') {
        sessionBudget = comm.beginningBudget ?? 0;
      } else {
        // Female committee number ends with F, male is without F
        const maleNumber = comm.number.endsWith('F') ? comm.number.slice(0, -1) : comm.number;
        sessionBudget = maleBudgetMap.get(maleNumber) ?? 0;
      }

      let grandTotalRevenue = 0;
      let grandTotalExpense = 0;
      let grandTotalAllocatedBudget = 0;
      let grandTotalEstimatedBudget = 0;
      let totalRegistrations = 0;
      let totalVerifiedPayments = 0;

      const eventSummaries = committeeEvents.map((evt) => {
        const reg = regMap.get(evt.id) ?? { total: 0, verified: 0 };
        const eventExpenseTotal = expenseMap.get(evt.id) ?? 0;
        const pending = pendingClaimsMap.get(evt.id) ?? { count: 0, amount: 0 };
        const approved = approvedClaimsMap.get(evt.id) ?? { count: 0, amount: 0 };
        const eventRevenue = evt.isPaid ? reg.verified * (evt.fee ?? 0) : 0;
        const netAmount = eventRevenue - eventExpenseTotal;
        const clubSubsidy = Math.max(0, eventExpenseTotal - eventRevenue);

        grandTotalRevenue += eventRevenue;
        grandTotalExpense += eventExpenseTotal;
        grandTotalAllocatedBudget += evt.allocatedBudget ?? 0;
        grandTotalEstimatedBudget += evt.estimatedBudget ?? 0;
        totalRegistrations += reg.total;
        totalVerifiedPayments += reg.verified;

        return {
          id: evt.id,
          title: evt.title,
          description: evt.description,
          eventDate: evt.eventDate,
          venue: evt.venue,
          status: evt.status,
          isPaid: evt.isPaid,
          fee: evt.fee ?? 0,
          genderRestriction: evt.genderRestriction,
          bannerImage: evt.bannerImage,
          estimatedBudget: evt.estimatedBudget ?? 0,
          allocatedBudget: evt.allocatedBudget ?? 0,
          totalRegistrations: reg.total,
          verifiedPayments: reg.verified,
          totalRevenue: eventRevenue,
          totalExpense: eventExpenseTotal,
          netAmount,
          clubSubsidy,
          pendingClaims: pending.count,
          pendingClaimsAmount: pending.amount,
          approvedClaims: approved.count,
          approvedClaimsAmount: approved.amount,
          financesLocked: evt.financesLocked,
          voucherNumber: voucherMap.get(evt.id) ?? null,
          createdAt: evt.createdAt,
        };
      });

      const grandClubSubsidy = Math.max(0, grandTotalExpense - grandTotalRevenue);
      const grandNetAmount = grandTotalRevenue - grandTotalExpense;

      return {
        committee: {
          number: comm.number,
          gender: comm.gender,
          start: comm.start,
          end: comm.end,
          beginningBudget: sessionBudget,
          description: comm.description,
          isActive: !comm.end,
        },
        financials: {
          beginningBudget: sessionBudget,
          totalAllocatedBudget: grandTotalAllocatedBudget,
          totalEstimatedBudget: grandTotalEstimatedBudget,
          totalRevenue: grandTotalRevenue,
          totalExpense: grandTotalExpense,
          clubSubsidy: grandClubSubsidy,
          netAmount: grandNetAmount,
          remainingBudget: sessionBudget - grandClubSubsidy,
        },
        stats: {
          totalEvents: committeeEvents.length,
          totalRegistrations,
          totalVerifiedPayments,
        },
        events: eventSummaries,
        members,
      };
    });
  });
