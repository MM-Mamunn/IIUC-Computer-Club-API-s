import { db } from '../../config/db';
import {
  events,
  eventRegistrations,
  eventDuties,
  eventManagers,
  eventExpenses,
  expenseClaims,
  vouchers,
  refundRequests,
} from '../../db/event.schema';
import { createRefundCasesForEvent } from '../refund/refund.service';
import { users, committee, executives } from '../../db/schema';
import { eq, ne, desc, and, or, count, sum, sql, lte } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { hashPassword } from '../../utils/hash';
import { cached, invalidate } from '../../utils/cache';
import { assertCommitteeOpen } from '../global/global.service';
import {
  sendEventRegistrationEmail,
  sendPaymentConfirmedEmail,
  sendPaymentRejectionEmail,
  sendDutyAssignmentEmail,
} from '../../utils/email';
import { getBangladeshDayKey, getBangladeshYear } from '../../utils/datetime';
import { generateToken, verifyToken } from '../../utils/jwt';

function invalidateEventCaches() {
  invalidate('events:');
  invalidate('dashboard:');
  invalidate('president:');
}

// ─── Create Event ───
export const createEvent = async (
  data: {
    title: string;
    description?: string;
    committeeNumber: string;
    eventDate: string;
    registrationDeadline?: string;
    venue?: string;
    isPaid?: boolean;
    isDonation?: boolean;
    fee?: number;
    maxParticipants?: number;
    bannerImage?: string;
    paymentNumbers?: { bkash?: string[]; nagad?: string[] };
    sslcommerzEnabled?: boolean;
    customFields?: unknown;
    estimatedBudget?: number;
    allocatedBudget?: number;
    genderRestriction?: string;
    isFeatured?: boolean;
  },
  c: Context,
) => {
  const user = c.get('user');
  if (!data.title || !data.committeeNumber || !data.eventDate) {
    throw new HTTPException(400, { message: 'Title, committee, and event date are required' });
  }

  await assertCommitteeOpen(data.committeeNumber);

  // Validate gender restriction
  const genderRestriction = data.genderRestriction ?? 'both';
  if (!['male', 'female', 'both'].includes(genderRestriction)) {
    throw new HTTPException(400, { message: 'Gender restriction must be male, female, or both' });
  }

  if (data.maxParticipants !== undefined && data.maxParticipants !== null) {
    if (!Number.isInteger(data.maxParticipants) || data.maxParticipants <= 0) {
      throw new HTTPException(400, { message: 'Max participants must be a positive integer' });
    }
  }

  const [event] = await db.transaction(async (tx) => {
    if (data.isFeatured) {
      await tx.update(events).set({ isFeatured: false }).where(eq(events.isFeatured, true));
    }

    return tx
      .insert(events)
      .values({
        title: data.title,
        description: data.description ?? null,
        committeeNumber: data.committeeNumber,
        eventDate: new Date(data.eventDate),
        registrationDeadline: data.registrationDeadline
          ? new Date(data.registrationDeadline)
          : null,
        venue: data.venue ?? null,
        isPaid: data.isPaid ?? false,
        isDonation: data.isDonation ?? false,
        fee: data.fee ?? 0,
        maxParticipants: data.maxParticipants ?? null,
        bannerImage: data.bannerImage ?? null,
        status: 'upcoming',
        paymentNumbers: data.paymentNumbers ?? null,
        sslcommerzEnabled: data.sslcommerzEnabled ?? false,
        customFields: data.customFields ?? null,
        createdBy: user.id,
        estimatedBudget: data.estimatedBudget ?? 0,
        allocatedBudget: data.allocatedBudget ?? 0,
        genderRestriction,
        isFeatured: data.isFeatured ?? false,
      })
      .returning();
  });

  return event;
};

// ─── Auto-update Event Statuses ───
// Transitions: upcoming → ongoing (when eventDate passes), ongoing → completed (24h after eventDate)
let lastAutoUpdate = 0;
const AUTO_UPDATE_INTERVAL = 30_000; // Run at most every 30 seconds

export const autoUpdateEventStatuses = async () => {
  const now = Date.now();
  if (now - lastAutoUpdate < AUTO_UPDATE_INTERVAL) return;
  lastAutoUpdate = now;

  const currentTime = new Date();
  const ongoingCutoff = new Date(now - 24 * 60 * 60 * 1000); // 24h ago

  // upcoming → ongoing: event date has passed
  const toOngoing = await db
    .update(events)
    .set({ status: 'ongoing' })
    .where(and(eq(events.status, 'upcoming'), lte(events.eventDate, currentTime)))
    .returning({ id: events.id });

  // ongoing → completed: 24h after event date
  const toCompleted = await db
    .update(events)
    .set({ status: 'completed' })
    .where(and(eq(events.status, 'ongoing'), lte(events.eventDate, ongoingCutoff)))
    .returning({ id: events.id });

  if (toOngoing.length > 0 || toCompleted.length > 0) {
    invalidate('events:');
    invalidate('dashboard:');
    invalidate('president:');
  }
};

// ─── List Events ───
export const listEvents = (committeeNumber?: string, status?: string, gender?: string) => {
  const cacheKey = `events:list:${committeeNumber ?? ''}:${status ?? ''}:${gender ?? ''}`;
  return cached(cacheKey, 15_000, async () => {
    if (gender) {
      let query = db
        .select({
          id: events.id,
          title: events.title,
          description: events.description,
          committeeNumber: events.committeeNumber,
          eventDate: events.eventDate,
          registrationDeadline: events.registrationDeadline,
          venue: events.venue,
          isPaid: events.isPaid,
          isDonation: events.isDonation,
          fee: events.fee,
          maxParticipants: events.maxParticipants,
          bannerImage: events.bannerImage,
          status: events.status,
          isFeatured: events.isFeatured,
          paymentNumbers: events.paymentNumbers,
          sslcommerzEnabled: events.sslcommerzEnabled,
          customFields: events.customFields,
          createdBy: events.createdBy,
          estimatedBudget: events.estimatedBudget,
          genderRestriction: events.genderRestriction,
          createdAt: events.createdAt,
          registrationCount:
            sql<number>`(select count(*)::int from event_registrations er where er.event_id = ${events.id} and er.payment_status != 'failed')`.as(
              'registrationCount',
            ),
        })
        .from(events)
        .innerJoin(committee, eq(events.committeeNumber, committee.number))
        .orderBy(desc(events.eventDate))
        .$dynamic();

      const conditions = [or(eq(committee.gender, gender), eq(events.genderRestriction, 'both'))];
      if (committeeNumber) conditions.push(eq(events.committeeNumber, committeeNumber));
      if (status) conditions.push(eq(events.status, status));
      query = query.where(and(...conditions));

      return query;
    }

    let query = db
      .select({
        id: events.id,
        title: events.title,
        description: events.description,
        committeeNumber: events.committeeNumber,
        eventDate: events.eventDate,
        registrationDeadline: events.registrationDeadline,
        venue: events.venue,
        isPaid: events.isPaid,
        isDonation: events.isDonation,
        fee: events.fee,
        maxParticipants: events.maxParticipants,
        bannerImage: events.bannerImage,
        status: events.status,
        isFeatured: events.isFeatured,
        paymentNumbers: events.paymentNumbers,
        sslcommerzEnabled: events.sslcommerzEnabled,
        customFields: events.customFields,
        createdBy: events.createdBy,
        estimatedBudget: events.estimatedBudget,
        allocatedBudget: events.allocatedBudget,
        financesLocked: events.financesLocked,
        financesLockedBy: events.financesLockedBy,
        financesLockedAt: events.financesLockedAt,
        genderRestriction: events.genderRestriction,
        createdAt: events.createdAt,
        registrationCount:
          sql<number>`(select count(*)::int from event_registrations er where er.event_id = ${events.id} and er.payment_status != 'failed')`.as(
            'registrationCount',
          ),
      })
      .from(events)
      .orderBy(desc(events.eventDate))
      .$dynamic();

    const conditions = [];
    if (committeeNumber) conditions.push(eq(events.committeeNumber, committeeNumber));
    if (status) conditions.push(eq(events.status, status));

    if (conditions.length > 0) {
      query = query.where(and(...conditions));
    }

    return query;
  });
};

// ─── Get Single Event with registration count ───
export const getEventById = async (id: number) => {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  const [regCount] = await db
    .select({ count: count() })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, id),
        ne(eventRegistrations.paymentStatus, 'failed')
      )
    );

  return { ...event, registrationCount: regCount?.count ?? 0 };
};

// ─── Update Event ───
export const updateEvent = async (id: number, data: Record<string, unknown>) => {
  const [existing] = await db.select().from(events).where(eq(events.id, id));
  if (!existing) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(existing.committeeNumber);

  // Whitelist of allowed fields
  const allowed = new Set([
    'title',
    'description',
    'eventDate',
    'registrationDeadline',
    'venue',
    'isPaid',
    'isDonation',
    'fee',
    'maxParticipants',
    'bannerImage',
    'status',
    'paymentNumbers',
    'sslcommerzEnabled',
    'customFields',
    'estimatedBudget',
    'allocatedBudget',
    'genderRestriction',
    'committeeNumber',
    'isFeatured',
  ]);

  const updateData: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(data)) {
    if (v !== undefined && allowed.has(k)) {
      if (k === 'eventDate' || k === 'registrationDeadline') {
        updateData[k] = v ? new Date(v as string) : null;
      } else {
        updateData[k] = v;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(updateData, 'maxParticipants')) {
    const rawMaxParticipants = updateData.maxParticipants;
    if (
      rawMaxParticipants !== null &&
      (typeof rawMaxParticipants !== 'number' ||
        !Number.isInteger(rawMaxParticipants) ||
        rawMaxParticipants <= 0)
    ) {
      throw new HTTPException(400, { message: 'Max participants must be a positive integer' });
    }
  }

  if (Object.keys(updateData).length === 0) {
    throw new HTTPException(400, { message: 'No fields to update' });
  }

  const [updated] = await db.transaction(async (tx) => {
    if (updateData.isFeatured === true) {
      await tx
        .update(events)
        .set({ isFeatured: false })
        .where(and(eq(events.isFeatured, true), ne(events.id, id)));
    }

    return tx.update(events).set(updateData).where(eq(events.id, id)).returning();
  });

  // Auto-create refund cases only for cancelled paid events.
  const nextStatus = (updateData.status as string | undefined) ?? existing.status;
  const nextIsPaid = (updateData.isPaid as boolean | undefined) ?? existing.isPaid ?? false;
  const nextIsDonation =
    (updateData.isDonation as boolean | undefined) ?? existing.isDonation ?? false;

  if (nextStatus === 'cancelled' && (nextIsPaid || nextIsDonation)) {
    createRefundCasesForEvent(id).catch((err) =>
      console.error('[Refund] Failed to create refund cases:', err),
    );
  }

  return updated;
};

// ─── Delete Event ───
export const deleteEvent = async (id: number) => {
  const [existing] = await db.select().from(events).where(eq(events.id, id));
  if (!existing) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(existing.committeeNumber);

  await db.delete(events).where(eq(events.id, id));
  return { success: true, message: 'Event deleted' };
};

// ─── Register for Event ───
export const registerForEvent = async (
  eventId: number,
  userId: string,
  paymentMethod?: string,
  transactionId?: string,
  customFieldResponses?: unknown,
  donationAmount?: number,
) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  if (event.status === 'cancelled')
    throw new HTTPException(400, { message: 'This event has been cancelled' });
  if (event.status === 'completed')
    throw new HTTPException(400, { message: 'This event has already been completed' });

  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new HTTPException(400, { message: 'Registration deadline has passed' });
  }

  // Check gender restriction
  if (event.genderRestriction && event.genderRestriction !== 'both') {
    const [regUser] = await db
      .select({ gender: users.gender })
      .from(users)
      .where(eq(users.id, userId));
    if (regUser && regUser.gender !== event.genderRestriction) {
      const allowed = event.genderRestriction === 'male' ? 'male' : 'female';
      throw new HTTPException(403, {
        message: `This event is restricted to ${allowed} students only`,
      });
    }
  }

  // Check max participants
  if (event.maxParticipants) {
    const [regCount] = await db
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          ne(eventRegistrations.paymentStatus, 'failed')
        )
      );
    if ((regCount?.count ?? 0) >= event.maxParticipants) {
      throw new HTTPException(400, { message: 'This event has reached maximum participants' });
    }
  }

  // Check already registered
  const [existing] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));

  if (existing) {
    if (existing.paymentStatus !== 'failed') {
      throw new HTTPException(409, { message: 'You are already registered for this event' });
    }
  }

  // For paid events with manual payment, require transaction ID
  // For donation events, require a donation amount > 0
  if (event.isDonation) {
    if (!donationAmount || donationAmount <= 0) {
      throw new HTTPException(400, { message: 'Please enter a donation amount' });
    }
    if (paymentMethod && paymentMethod !== 'sslcommerz' && !transactionId) {
      throw new HTTPException(400, { message: 'Transaction ID is required for manual payment' });
    }
  } else if (event.isPaid && paymentMethod && paymentMethod !== 'sslcommerz' && !transactionId) {
    // For regular paid events, require transaction ID for manual payment
    throw new HTTPException(400, { message: 'Transaction ID is required for manual payment' });
  }

  let paymentStatus = 'free';
  if (event.isPaid || event.isDonation) {
    paymentStatus =
      paymentMethod === 'sslcommerz' ? 'pending' : transactionId ? 'pending' : 'pending';
  }

  let reg;
  if (existing && existing.paymentStatus === 'failed') {
    const updatedHistory: any = existing.rejectionHistory || [];
    updatedHistory.push({
      reason: existing.rejectionReason,
      type: existing.rejectionType,
      rejectedAt: new Date().toISOString(),
      transactionId: existing.transactionId,
      paymentMethod: existing.paymentMethod,
    });

    [reg] = await db
      .update(eventRegistrations)
      .set({
        paymentStatus,
        paymentMethod: event.isPaid || event.isDonation ? (paymentMethod ?? null) : null,
        transactionId: transactionId ?? null,
        donationAmount: event.isDonation ? (donationAmount ?? null) : null,
        customFieldResponses: customFieldResponses ?? null,
        rejectionReason: null,
        rejectionType: null,
        rejectionHistory: updatedHistory,
      })
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
      .returning();
  } else {
    [reg] = await db
      .insert(eventRegistrations)
      .values({
        eventId,
        userId,
        paymentStatus,
        paymentMethod: event.isPaid || event.isDonation ? (paymentMethod ?? null) : null,
        transactionId: transactionId ?? null,
        donationAmount: event.isDonation ? (donationAmount ?? null) : null,
        customFieldResponses: customFieldResponses ?? null,
      })
      .returning();
  }

  invalidateEventCaches();

  // Send registration confirmation email (async, don't block)
  const [regUser] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (regUser) {
    await sendEventRegistrationEmail(
      regUser.email,
      regUser.name,
      event.title,
      event.eventDate.toISOString(),
      event.venue,
      event.isPaid,
      event.fee ?? 0,
      event.isDonation,
    );
  }

  return { ...reg, event };
};

// ─── Guest Registration for Event (creates account + registers) ───
export const guestRegisterForEvent = async (
  eventId: number,
  data: {
    studentId: string;
    email: string;
    name: string;
    gender: string;
    password: string;
    customFieldResponses?: unknown;
    paymentMethod?: string;
    transactionId?: string;
    donationAmount?: number;
  },
) => {
  // Validate gender
  if (data.gender !== 'male' && data.gender !== 'female') {
    throw new HTTPException(400, { message: "Please specify your gender as 'male' or 'female'" });
  }

  // Check if event exists and is open
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  if (event.status === 'cancelled')
    throw new HTTPException(400, { message: 'This event has been cancelled' });
  if (event.status === 'completed')
    throw new HTTPException(400, { message: 'This event has already been completed' });
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new HTTPException(400, { message: 'Registration deadline has passed' });
  }

  // Check gender restriction
  if (event.genderRestriction && event.genderRestriction !== 'both') {
    if (data.gender !== event.genderRestriction) {
      const allowed = event.genderRestriction === 'male' ? 'male' : 'female';
      throw new HTTPException(403, {
        message: `This event is restricted to ${allowed} students only`,
      });
    }
  }

  // Check max participants
  if (event.maxParticipants) {
    const [regCount] = await db
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          ne(eventRegistrations.paymentStatus, 'failed')
        )
      );
    if ((regCount?.count ?? 0) >= event.maxParticipants) {
      throw new HTTPException(400, { message: 'This event has reached maximum participants' });
    }
  }

  const studentId = data.studentId.trim().toUpperCase();
  const email = data.email.trim().toLowerCase();

  // Check if user already exists
  const [existingUser] = await db.select().from(users).where(eq(users.id, studentId));

  if (existingUser) {
    throw new HTTPException(409, {
      message:
        'An account already exists with this ID. Please log in to register for this event.',
    });
  }

  // Check if email is taken
  const [emailUser] = await db.select().from(users).where(eq(users.email, email));
  if (emailUser) {
    throw new HTTPException(409, {
      message:
        'An account already exists with this email. Please log in to register for this event.',
    });
  }

  // Validate password
  if (!data.password || data.password.length < 6) {
    throw new HTTPException(400, { message: 'Password must be at least 6 characters' });
  }

  const hashed = await hashPassword(data.password);

  const [newUser] = await db
    .insert(users)
    .values({
      id: studentId,
      name: data.name.trim(),
      email,
      password: hashed,
      gender: data.gender,
      mustChangePassword: false,
    })
    .returning();

  if (!newUser) {
    throw new HTTPException(500, { message: 'Failed to create user account' });
  }

  // Check not already registered (edge case)
  const [existingReg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, studentId)));
  if (existingReg) throw new HTTPException(409, { message: 'Already registered for this event' });

  // Determine payment status
  let paymentStatus = 'free';
  if (event.isPaid || event.isDonation) {
    paymentStatus = 'pending';
  }

  // For donation events, require donation amount
  if (event.isDonation) {
    if (!data.donationAmount || data.donationAmount <= 0) {
      throw new HTTPException(400, { message: 'Please enter a donation amount' });
    }
    if (data.paymentMethod && data.paymentMethod !== 'sslcommerz' && !data.transactionId) {
      throw new HTTPException(400, { message: 'Transaction ID is required for manual payment' });
    }
  } else if (
    event.isPaid &&
    data.paymentMethod &&
    data.paymentMethod !== 'sslcommerz' &&
    !data.transactionId
  ) {
    // For paid events with manual payment, require transaction ID
    throw new HTTPException(400, { message: 'Transaction ID is required for manual payment' });
  }

  const [reg] = await db
    .insert(eventRegistrations)
    .values({
      eventId,
      userId: studentId,
      paymentStatus,
      paymentMethod: event.isPaid || event.isDonation ? (data.paymentMethod ?? null) : null,
      transactionId: data.transactionId ?? null,
      donationAmount: event.isDonation ? (data.donationAmount ?? null) : null,
      customFieldResponses: data.customFieldResponses ?? null,
    })
    .returning();

  invalidateEventCaches();

  // Generate JWT token for auto-login
  const token = generateToken({
    id: studentId,
    role: 'student',
    position: '',
    gender: data.gender,
    committeeNumber: '',
    mustChangePassword: false,
  });

  // Send event registration confirmation email (async, don't block response)
  await sendEventRegistrationEmail(
    email,
    data.name.trim(),
    event.title,
    event.eventDate.toISOString(),
    event.venue,
    event.isPaid,
    event.fee ?? 0,
    event.isDonation,
  );

  return { registration: reg, event, token };
};

// ─── Submit Payment for existing registration ───
export const submitPayment = async (
  eventId: number,
  userId: string,
  paymentMethod: string,
  transactionId: string,
) => {
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (!reg) throw new HTTPException(404, { message: 'Registration not found' });
  if (reg.paymentStatus === 'verified')
    throw new HTTPException(400, { message: 'Payment already verified' });
  if (reg.paymentStatus === 'free')
    throw new HTTPException(400, { message: 'This is a free event' });

  if (!paymentMethod || !transactionId) {
    throw new HTTPException(400, {
      message: 'Please select a payment method and enter your Transaction ID',
    });
  }

  const updatedHistory: any = reg.rejectionHistory || [];
  if (reg.paymentStatus === 'failed') {
    updatedHistory.push({
      reason: reg.rejectionReason,
      type: reg.rejectionType,
      rejectedAt: new Date().toISOString(),
      transactionId: reg.transactionId,
      paymentMethod: reg.paymentMethod,
    });
  }

  const [updated] = await db
    .update(eventRegistrations)
    .set({
      paymentMethod,
      transactionId,
      paymentStatus: 'pending',
      rejectionReason: null,
      rejectionType: null,
      rejectionHistory: updatedHistory,
    })
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
    .returning();

  invalidateEventCaches();

  return updated;
};

// ─── Get Fix Payment Details (public with token) ───
export const getFixPaymentDetails = async (eventId: number, token: string) => {
  let payload: { id: string; eventId: number; purpose: string };
  try {
    payload = verifyToken(token) as typeof payload;
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired fix-payment link' });
  }

  if (payload.purpose !== 'fix-payment' || payload.eventId !== eventId) {
    throw new HTTPException(401, { message: 'Invalid fix-payment link' });
  }

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, payload.id)));
  if (!reg) throw new HTTPException(404, { message: 'Registration not found' });

  // If fix-payment was already used, link is invalid
  if (reg.fixPaymentUsed) {
    throw new HTTPException(400, {
      message: 'This link has already been used. Your payment is being reviewed.',
    });
  }

  const [user] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, payload.id));

  // Compute amount deficit for incorrect_amount rejections
  let amountDeficit: number | undefined;
  if (reg.rejectionType === 'incorrect_amount') {
    // Check if admin specified a custom amount in the rejection history
    const history = (reg.rejectionHistory as Array<{ amountDeficit?: number }>) ?? [];
    const latestEntry = history.length > 0 ? history[history.length - 1] : null;
    if (latestEntry?.amountDeficit && latestEntry.amountDeficit > 0) {
      amountDeficit = latestEntry.amountDeficit;
    } else if (!event.isDonation) {
      const required = event.fee ?? 0;
      const paid = reg.donationAmount ?? 0;
      amountDeficit = required - paid;
      if (amountDeficit <= 0) amountDeficit = undefined;
    }
  }

  return {
    event: {
      id: event.id,
      title: event.title,
      eventDate: event.eventDate,
      venue: event.venue,
      fee: event.fee,
      isPaid: event.isPaid,
      isDonation: event.isDonation,
      paymentNumbers: event.paymentNumbers,
    },
    registration: {
      userId: payload.id,
      paymentStatus: reg.paymentStatus,
      rejectionReason: reg.rejectionReason,
      rejectionType: reg.rejectionType,
      donationAmount: reg.donationAmount,
      amountDeficit,
    },
    user: user ? { name: user.name, email: user.email } : null,
  };
};

// ─── Fix Payment (resubmit after rejection, public with token) ───
export const fixPayment = async (
  eventId: number,
  token: string,
  paymentMethod?: string,
  transactionId?: string,
  donationAmount?: number,
  mfsNumber?: string,
) => {
  let payload: { id: string; eventId: number; purpose: string };
  try {
    payload = verifyToken(token) as typeof payload;
  } catch {
    throw new HTTPException(401, { message: 'Invalid or expired fix-payment link' });
  }

  if (payload.purpose !== 'fix-payment' || payload.eventId !== eventId) {
    throw new HTTPException(401, { message: 'Invalid fix-payment link' });
  }

  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, payload.id)));
  if (!reg) throw new HTTPException(404, { message: 'Registration not found' });
  if (reg.paymentStatus === 'verified')
    throw new HTTPException(400, { message: 'Payment already verified' });
  if (reg.fixPaymentUsed)
    throw new HTTPException(400, {
      message: 'This fix-payment link has already been used. Please contact the event organizers.',
    });

  const rejectionType = reg.rejectionType || 'other';

  if (rejectionType === 'incorrect_trxid') {
    // Only need a corrected transaction ID (and optional MFS number)
    if (!transactionId || !transactionId.trim()) {
      throw new HTTPException(400, { message: 'Please enter your correct Transaction ID' });
    }

    const updateData: Record<string, unknown> = {
      transactionId: transactionId.trim(),
      paymentStatus: 'pending',
      rejectionReason: null,
      rejectionType: null,
      fixPaymentUsed: true,
    };

    const [updated] = await db
      .update(eventRegistrations)
      .set(updateData)
      .where(
        and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, payload.id)),
      )
      .returning();

    invalidateEventCaches();

    return updated;
  } else {
    // incorrect_amount or other — need full payment details
    if (!paymentMethod || !transactionId) {
      throw new HTTPException(400, {
        message: 'Please select a payment method and enter your Transaction ID',
      });
    }

    const updateData: Record<string, unknown> = {
      paymentMethod,
      transactionId: transactionId.trim(),
      paymentStatus: 'pending',
      rejectionReason: null,
      rejectionType: null,
      fixPaymentUsed: true,
    };

    // For donation events, update donation amount if provided
    if (donationAmount && donationAmount > 0) {
      updateData.donationAmount = donationAmount;
    }

    const [updated] = await db
      .update(eventRegistrations)
      .set(updateData)
      .where(
        and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, payload.id)),
      )
      .returning();

    invalidateEventCaches();

    return updated;
  }
};

// ─── Verify Payment (admin) ───
export const verifyPayment = async (
  eventId: number,
  userId: string,
  verified: boolean,
  rejectionReason?: string,
  frontendBaseUrl?: string,
  rejectionType?: string,
  correctAmount?: number,
) => {
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (!reg) throw new HTTPException(404, { message: 'Registration not found' });

  if (verified) {
    // Approve payment
    const [updated] = await db
      .update(eventRegistrations)
      .set({
        paymentStatus: 'verified',
        rejectionReason: null,
        rejectionType: null,
        fixPaymentUsed: false,
      })
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
      .returning();

    invalidateEventCaches();

    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (user?.email && event) {
      await sendPaymentConfirmedEmail(
        user.email,
        user.name,
        event.title,
        event.eventDate.toISOString(),
        event.venue,
        event.fee ?? 0,
        event.isDonation,
      );
    }

    return updated;
  } else {
    // Reject payment — store reason, type, and history
    if (!rejectionReason || !rejectionReason.trim()) {
      throw new HTTPException(400, { message: 'Please provide a reason for rejection' });
    }

    const validTypes = ['incorrect_trxid', 'incorrect_amount', 'other'];
    const type = validTypes.includes(rejectionType ?? '') ? rejectionType! : 'other';

    const [event] = await db.select().from(events).where(eq(events.id, eventId));

    // For incorrect_amount, use admin-specified correctAmount if provided
    let amountDeficit: number | undefined;
    if (type === 'incorrect_amount' && event) {
      if (correctAmount && correctAmount > 0) {
        // Admin explicitly specified the amount the student needs to pay
        amountDeficit = correctAmount;
      } else if (event.isDonation) {
        // For donation events, there's no fixed fee — admin specifies in the reason
        amountDeficit = undefined;
      } else {
        const paid = reg.donationAmount ?? 0;
        const required = event.fee ?? 0;
        amountDeficit = required - paid;
        if (amountDeficit <= 0) amountDeficit = undefined;
      }
    }

    const existingHistory =
      (reg.rejectionHistory as Array<{
        reason: string;
        type?: string;
        rejectedAt: string;
        transactionId: string | null;
        paymentMethod: string | null;
        amountDeficit?: number;
      }>) ?? [];

    const newHistoryEntry = {
      reason: rejectionReason.trim(),
      type,
      rejectedAt: new Date().toISOString(),
      transactionId: reg.transactionId,
      paymentMethod: reg.paymentMethod,
      ...(amountDeficit !== undefined ? { amountDeficit } : {}),
    };

    const [updated] = await db
      .update(eventRegistrations)
      .set({
        paymentStatus: 'failed',
        rejectionReason: rejectionReason.trim(),
        rejectionType: type,
        rejectionHistory: [...existingHistory, newHistoryEntry],
        fixPaymentUsed: false,
      })
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
      .returning();

    // Send rejection email with fix-payment link
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (user?.email && event) {
      // Generate a JWT token for the fix-payment flow (valid for 7 days)
      const fixToken = generateToken({ id: userId, eventId, purpose: 'fix-payment' }, '7d');
      const baseUrl = frontendBaseUrl || process.env.FRONTEND_URL || 'http://localhost:3000';
      const fixPaymentLink = `${baseUrl}/events/${eventId}/fix-payment?token=${fixToken}`;

      await sendPaymentRejectionEmail(
        user.email,
        user.name,
        event.title,
        event.eventDate.toISOString(),
        event.venue,
        rejectionReason.trim(),
        fixPaymentLink,
        event.fee ?? 0,
        event.isDonation,
        type,
        amountDeficit,
      );
    }

    invalidateEventCaches();

    return updated;
  }
};

// ─── SSLCommerz: mark registration verified (called from IPN) ───
export const verifySslcommerzPayment = async (tranId: string, valId: string) => {
  // Find registration by sslcommerz tran_id
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(eq(eventRegistrations.sslcommerzTranId, tranId));
  if (!reg)
    throw new HTTPException(404, { message: 'Registration not found for this transaction' });

  const [updated] = await db
    .update(eventRegistrations)
    .set({
      paymentStatus: 'verified',
      sslcommerzValId: valId,
    })
    .where(
      and(eq(eventRegistrations.eventId, reg.eventId), eq(eventRegistrations.userId, reg.userId)),
    )
    .returning();

  invalidateEventCaches();

  // Send confirmation email
  const [user] = await db.select().from(users).where(eq(users.id, reg.userId));
  const [event] = await db.select().from(events).where(eq(events.id, reg.eventId));
  if (user?.email && event) {
    await sendPaymentConfirmedEmail(
      user.email,
      user.name,
      event.title,
      event.eventDate.toISOString(),
      event.venue,
      event.fee ?? 0,
      event.isDonation,
    );
  }

  return updated;
};

// ─── SSLCommerz: set tran_id on registration ───
export const setSslcommerzTranId = async (eventId: number, userId: string, tranId: string) => {
  const [updated] = await db
    .update(eventRegistrations)
    .set({ sslcommerzTranId: tranId, paymentMethod: 'sslcommerz', paymentStatus: 'pending' })
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
    .returning();

  invalidateEventCaches();

  return updated;
};

// ─── Save Draft Data ───
export const saveDraftData = async (eventId: number, userId: string, draftData: unknown) => {
  // Upsert: check if registration exists
  const [existing] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));

  if (existing) {
    const [updated] = await db
      .update(eventRegistrations)
      .set({ draftData })
      .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
      .returning();
    return updated;
  }

  // Create a draft registration row
  const [reg] = await db
    .insert(eventRegistrations)
    .values({ eventId, userId, paymentStatus: 'draft', draftData })
    .returning();
  return reg;
};

// ─── Get Draft Data ───
export const getDraftData = async (eventId: number, userId: string) => {
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  return reg?.draftData ?? null;
};

// ─── Unregister from Event ───
export const unregisterFromEvent = async (eventId: number, userId: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  // Block unregister after registration deadline, or on/after the event day if no deadline
  const now = new Date();
  if (event.registrationDeadline) {
    if (new Date(event.registrationDeadline) < now) {
      throw new HTTPException(400, {
        message: 'Cannot unregister after the registration deadline has passed.',
      });
    }
  } else {
    // No deadline set — block on the event day in Bangladesh time.
    const todayKey = getBangladeshDayKey(now);
    const eventDayKey = getBangladeshDayKey(event.eventDate);
    if (todayKey && eventDayKey && todayKey >= eventDayKey) {
      throw new HTTPException(400, {
        message: 'Cannot unregister on or after the event day.',
      });
    }
  }

  const [existing] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (!existing) throw new HTTPException(404, { message: 'Registration not found' });

  // Don't allow unregister if payment is verified (refund needed)
  if (existing.paymentStatus === 'verified') {
    throw new HTTPException(400, {
      message: 'Cannot unregister after payment is verified. Contact an admin for refund.',
    });
  }

  await db
    .delete(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));

  invalidateEventCaches();

  return { success: true, message: 'Unregistered successfully' };
};

// ─── Get Registration Stats for all events (lightweight, single query) ───
export const getRegistrationStats = async () => {
  const rows = await db
    .select({
      eventId: eventRegistrations.eventId,
      pending:
        sql<number>`count(*) filter (where ${eventRegistrations.paymentStatus} = 'pending')`.as(
          'pending',
        ),
      verified:
        sql<number>`count(*) filter (where ${eventRegistrations.paymentStatus} = 'verified')`.as(
          'verified',
        ),
    })
    .from(eventRegistrations)
    .groupBy(eventRegistrations.eventId);

  const stats: Record<number, { pending: number; verified: number }> = {};
  for (const row of rows) {
    stats[row.eventId] = { pending: Number(row.pending), verified: Number(row.verified) };
  }
  return stats;
};

// ─── Get Event Registrations (admin) ───
export const getEventRegistrations = async (eventId: number) => {
  const registrations = await db
    .select({
      userId: eventRegistrations.userId,
      name: users.name,
      email: users.email,
      profileImage: users.profileImage,
      registeredAt: eventRegistrations.registeredAt,
      paymentStatus: eventRegistrations.paymentStatus,
      paymentMethod: eventRegistrations.paymentMethod,
      transactionId: eventRegistrations.transactionId,
      donationAmount: eventRegistrations.donationAmount,
      customFieldResponses: eventRegistrations.customFieldResponses,
      rejectionReason: eventRegistrations.rejectionReason,
      rejectionHistory: eventRegistrations.rejectionHistory,
    })
    .from(eventRegistrations)
    .innerJoin(users, eq(eventRegistrations.userId, users.id))
    .where(eq(eventRegistrations.eventId, eventId));

  return registrations;
};

// ─── Update Registration Responses (admin / manager) ───
export const updateRegistrationResponses = async (
  eventId: number,
  userId: string,
  customFieldResponses: Record<string, unknown>,
) => {
  const [existing] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (!existing) throw new HTTPException(404, { message: 'Registration not found' });

  const [updated] = await db
    .update(eventRegistrations)
    .set({ customFieldResponses })
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
    .returning();

  return updated;
};

// ─── Assign Duty ───
export const assignDuty = async (
  eventId: number,
  userId: string,
  duty: string,
  description: string | null,
  c: Context,
) => {
  const assigner = c.get('user');
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);

  const [userExists] = await db.select().from(users).where(eq(users.id, userId));
  if (!userExists) throw new HTTPException(404, { message: 'User not found' });

  // Guard: target user must be an executive in an active committee
  const activeComms = await db
    .select({ number: committee.number })
    .from(committee)
    .where(and(eq(committee.number, event.committeeNumber), sql`${committee.end} IS NULL`));
  if (activeComms.length === 0)
    throw new HTTPException(400, { message: 'Committee is not active' });
  const [isExec] = await db
    .select()
    .from(executives)
    .where(and(eq(executives.id, userId), eq(executives.number, event.committeeNumber)));
  if (!isExec) {
    throw new HTTPException(403, {
      message: 'Only executive members of this committee can be assigned duties',
    });
  }

  const [existing] = await db
    .select()
    .from(eventDuties)
    .where(
      and(
        eq(eventDuties.eventId, eventId),
        eq(eventDuties.userId, userId),
        eq(eventDuties.duty, duty),
      ),
    );
  if (existing)
    throw new HTTPException(409, { message: 'This duty is already assigned to this user' });

  const [dutyRecord] = await db
    .insert(eventDuties)
    .values({ eventId, userId, duty, description, assignedBy: assigner.id })
    .returning();

  // Send notification email asynchronously
  try {
    const dashboardLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
    await sendDutyAssignmentEmail(
      userExists.email,
      userExists.name,
      event.title,
      duty,
      event.eventDate.toISOString(),
      event.venue,
      dashboardLink,
    );
  } catch (emailErr) {
    console.error('Failed to send duty assignment email notification:', emailErr);
  }

  return dutyRecord;
};

// ─── Remove Duty ───
export const removeDuty = async (eventId: number, userId: string, duty: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);

  const [existing] = await db
    .select()
    .from(eventDuties)
    .where(
      and(
        eq(eventDuties.eventId, eventId),
        eq(eventDuties.userId, userId),
        eq(eventDuties.duty, duty),
      ),
    );
  if (!existing) throw new HTTPException(404, { message: 'Duty assignment not found' });

  await db
    .delete(eventDuties)
    .where(
      and(
        eq(eventDuties.eventId, eventId),
        eq(eventDuties.userId, userId),
        eq(eventDuties.duty, duty),
      ),
    );

  return { success: true, message: 'Duty removed' };
};

// ─── Get Event Duties ───
export const getEventDuties = async (eventId: number) => {
  const duties = await db
    .select({
      userId: eventDuties.userId,
      name: users.name,
      email: users.email,
      profileImage: users.profileImage,
      duty: eventDuties.duty,
      description: eventDuties.description,
      assignedBy: eventDuties.assignedBy,
      assignedAt: eventDuties.assignedAt,
    })
    .from(eventDuties)
    .innerJoin(users, eq(eventDuties.userId, users.id))
    .where(eq(eventDuties.eventId, eventId));

  return duties;
};

// ─── Get My Duties (across all events) ───
export const getMyDuties = async (userId: string) => {
  const duties = await db
    .select({
      eventId: eventDuties.eventId,
      eventTitle: events.title,
      eventDate: events.eventDate,
      eventStatus: events.status,
      duty: eventDuties.duty,
      description: eventDuties.description,
      assignedAt: eventDuties.assignedAt,
    })
    .from(eventDuties)
    .innerJoin(events, eq(eventDuties.eventId, events.id))
    .where(eq(eventDuties.userId, userId))
    .orderBy(desc(events.eventDate));

  return duties;
};

// ─── Get My Registrations ───
export const getMyRegistrations = async (userId: string) => {
  const registrations = await db
    .select({
      eventId: eventRegistrations.eventId,
      eventTitle: events.title,
      eventDate: events.eventDate,
      eventStatus: events.status,
      venue: events.venue,
      isPaid: events.isPaid,
      isDonation: events.isDonation,
      fee: events.fee,
      registeredAt: eventRegistrations.registeredAt,
      paymentStatus: eventRegistrations.paymentStatus,
      paymentMethod: eventRegistrations.paymentMethod,
      transactionId: eventRegistrations.transactionId,
      donationAmount: eventRegistrations.donationAmount,
      customFieldResponses: eventRegistrations.customFieldResponses,
      rejectionReason: eventRegistrations.rejectionReason,
      rejectionType: eventRegistrations.rejectionType,
      rejectionHistory: eventRegistrations.rejectionHistory,
    })
    .from(eventRegistrations)
    .innerJoin(events, eq(eventRegistrations.eventId, events.id))
    .where(eq(eventRegistrations.userId, userId))
    .orderBy(desc(events.eventDate));

  return registrations;
};

// ─── Event Managers (delegation) ───

/** Check if a user is an event manager for a specific event. */
export const isEventManager = async (eventId: number, userId: string): Promise<boolean> => {
  const [row] = await db
    .select()
    .from(eventManagers)
    .where(and(eq(eventManagers.eventId, eventId), eq(eventManagers.userId, userId)));
  return !!row;
};

/** Assign a user as manager for a specific event. */
export const addEventManager = async (eventId: number, userId: string, assignedBy: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);

  const [userExists] = await db.select().from(users).where(eq(users.id, userId));
  if (!userExists) throw new HTTPException(404, { message: 'User not found' });

  // Guard: target user must be an executive in an active committee
  const activeCommsForMgr = await db
    .select({ number: committee.number })
    .from(committee)
    .where(and(eq(committee.number, event.committeeNumber), sql`${committee.end} IS NULL`));
  if (activeCommsForMgr.length === 0)
    throw new HTTPException(400, { message: 'Committee is not active' });
  const [isExecForMgr] = await db
    .select()
    .from(executives)
    .where(and(eq(executives.id, userId), eq(executives.number, event.committeeNumber)));
  if (!isExecForMgr) {
    throw new HTTPException(403, {
      message: 'Only executive members of this committee can be assigned as event managers',
    });
  }

  const [existing] = await db
    .select()
    .from(eventManagers)
    .where(and(eq(eventManagers.eventId, eventId), eq(eventManagers.userId, userId)));
  if (existing)
    throw new HTTPException(409, { message: 'User is already a manager for this event' });

  const [row] = await db.insert(eventManagers).values({ eventId, userId, assignedBy }).returning();

  // Send notification email asynchronously
  try {
    const dashboardLink = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`;
    await sendDutyAssignmentEmail(
      userExists.email,
      userExists.name,
      event.title,
      'Event Manager',
      event.eventDate.toISOString(),
      event.venue,
      dashboardLink,
    );
  } catch (emailErr) {
    console.error('Failed to send event manager email notification:', emailErr);
  }

  return row;
};

/** Remove a user as manager for a specific event. */
export const removeEventManager = async (eventId: number, userId: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);

  const [existing] = await db
    .select()
    .from(eventManagers)
    .where(and(eq(eventManagers.eventId, eventId), eq(eventManagers.userId, userId)));
  if (!existing) throw new HTTPException(404, { message: 'Manager assignment not found' });

  await db
    .delete(eventManagers)
    .where(and(eq(eventManagers.eventId, eventId), eq(eventManagers.userId, userId)));
  return { success: true, message: 'Manager removed' };
};

/** Get all managers for a specific event. */
export const getEventManagers = async (eventId: number) => {
  return db
    .select({
      userId: eventManagers.userId,
      name: users.name,
      email: users.email,
      profileImage: users.profileImage,
      assignedBy: eventManagers.assignedBy,
      assignedAt: eventManagers.assignedAt,
    })
    .from(eventManagers)
    .innerJoin(users, eq(eventManagers.userId, users.id))
    .where(eq(eventManagers.eventId, eventId));
};

/** Get all events a user is assigned to manage. */
export const getMyManagedEvents = async (userId: string) => {
  const rows = await db
    .select({
      eventId: eventManagers.eventId,
      title: events.title,
      eventDate: events.eventDate,
      venue: events.venue,
      status: events.status,
      bannerImage: events.bannerImage,
      isPaid: events.isPaid,
      fee: events.fee,
      assignedAt: eventManagers.assignedAt,
    })
    .from(eventManagers)
    .innerJoin(events, eq(eventManagers.eventId, events.id))
    .where(eq(eventManagers.userId, userId))
    .orderBy(desc(events.eventDate));
  return rows;
};

// ══════════════════════════════════════════════
// FINANCIAL: Expenses, Claims, Vouchers
// ══════════════════════════════════════════════

// ─── Event Expenses ───

export const addEventExpense = async (
  eventId: number,
  data: { description: string; amount: number; category?: string; receiptImage?: string },
  userId: string,
) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);
  if (event.financesLocked) {
    throw new HTTPException(403, { message: 'Finances are locked for this event' });
  }
  if (!data.description || !data.amount || data.amount <= 0) {
    throw new HTTPException(400, { message: 'description and a positive amount are required' });
  }

  const [expense] = await db
    .insert(eventExpenses)
    .values({
      eventId,
      description: data.description,
      amount: data.amount,
      category: data.category ?? 'other',
      receiptImage: data.receiptImage ?? null,
      submittedBy: userId,
    })
    .returning();

  return expense;
};

export const updateEventExpense = async (
  expenseId: number,
  data: { description?: string; amount?: number; category?: string; receiptImage?: string },
) => {
  const [existing] = await db.select().from(eventExpenses).where(eq(eventExpenses.id, expenseId));
  if (!existing) throw new HTTPException(404, { message: 'Expense not found' });

  // Check committee closed
  const [evtForClose] = await db
    .select({ committeeNumber: events.committeeNumber })
    .from(events)
    .where(eq(events.id, existing.eventId));
  if (evtForClose) await assertCommitteeOpen(evtForClose.committeeNumber);

  // Check lock
  const [evt] = await db
    .select({ financesLocked: events.financesLocked })
    .from(events)
    .where(eq(events.id, existing.eventId));
  if (evt?.financesLocked)
    throw new HTTPException(403, { message: 'Finances are locked for this event' });

  const updateData: Record<string, unknown> = {};
  if (data.description !== undefined) updateData.description = data.description;
  if (data.amount !== undefined) {
    if (data.amount <= 0) throw new HTTPException(400, { message: 'amount must be positive' });
    updateData.amount = data.amount;
  }
  if (data.category !== undefined) updateData.category = data.category;
  if (data.receiptImage !== undefined) updateData.receiptImage = data.receiptImage;

  if (Object.keys(updateData).length === 0) {
    throw new HTTPException(400, { message: 'No fields to update' });
  }

  const [updated] = await db
    .update(eventExpenses)
    .set(updateData)
    .where(eq(eventExpenses.id, expenseId))
    .returning();
  return updated;
};

export const deleteEventExpense = async (expenseId: number) => {
  const [existing] = await db.select().from(eventExpenses).where(eq(eventExpenses.id, expenseId));
  if (!existing) throw new HTTPException(404, { message: 'Expense not found' });

  // Check committee closed
  const [evtForClose] = await db
    .select({ committeeNumber: events.committeeNumber })
    .from(events)
    .where(eq(events.id, existing.eventId));
  if (evtForClose) await assertCommitteeOpen(evtForClose.committeeNumber);

  // Check lock
  const [evt] = await db
    .select({ financesLocked: events.financesLocked })
    .from(events)
    .where(eq(events.id, existing.eventId));
  if (evt?.financesLocked)
    throw new HTTPException(403, { message: 'Finances are locked for this event' });

  await db.delete(eventExpenses).where(eq(eventExpenses.id, expenseId));
  return { success: true, message: 'Expense deleted' };
};

export const getEventExpenses = async (eventId: number) => {
  return db
    .select({
      id: eventExpenses.id,
      eventId: eventExpenses.eventId,
      description: eventExpenses.description,
      amount: eventExpenses.amount,
      category: eventExpenses.category,
      receiptImage: eventExpenses.receiptImage,
      submittedBy: eventExpenses.submittedBy,
      submitterName: users.name,
      createdAt: eventExpenses.createdAt,
    })
    .from(eventExpenses)
    .leftJoin(users, eq(eventExpenses.submittedBy, users.id))
    .where(eq(eventExpenses.eventId, eventId))
    .orderBy(desc(eventExpenses.createdAt));
};

// ─── Expense Claims ───

export const submitExpenseClaim = async (
  eventId: number,
  userId: string,
  data: { description: string; amount: number; proofImage: string },
) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);
  if (event.financesLocked) {
    throw new HTTPException(403, { message: 'Finances are locked for this event' });
  }

  // Verify user has a duty on this event
  const [duty] = await db
    .select()
    .from(eventDuties)
    .where(and(eq(eventDuties.eventId, eventId), eq(eventDuties.userId, userId)));
  if (!duty) {
    throw new HTTPException(403, {
      message: 'Only duty-assigned members can submit expense claims for this event',
    });
  }

  if (!data.description || !data.amount || data.amount <= 0 || !data.proofImage) {
    throw new HTTPException(400, {
      message: 'description, a positive amount, and proofImage are required',
    });
  }

  const [claim] = await db
    .insert(expenseClaims)
    .values({
      eventId,
      userId,
      description: data.description,
      amount: data.amount,
      proofImage: data.proofImage,
    })
    .returning();

  return claim;
};

export const reviewExpenseClaim = async (
  claimId: number,
  reviewerId: string,
  approved: boolean,
  notes?: string,
) => {
  const [claim] = await db.select().from(expenseClaims).where(eq(expenseClaims.id, claimId));
  if (!claim) throw new HTTPException(404, { message: 'Claim not found' });
  if (claim.status !== 'pending' && claim.status !== 'rejected' && claim.status !== 'approved') {
    throw new HTTPException(400, { message: `Claim is already ${claim.status} and cannot be reviewed` });
  }

  // Check committee closed
  const [evtForCommittee] = await db
    .select({ committeeNumber: events.committeeNumber })
    .from(events)
    .where(eq(events.id, claim.eventId));
  if (evtForCommittee) await assertCommitteeOpen(evtForCommittee.committeeNumber);

  // Check lock
  const [evt] = await db
    .select({ financesLocked: events.financesLocked })
    .from(events)
    .where(eq(events.id, claim.eventId));
  if (evt?.financesLocked)
    throw new HTTPException(403, { message: 'Finances are locked for this event' });

  const updatedHistory: any = claim.auditHistory || [];
  updatedHistory.push({
    action: approved ? 'approved' : 'rejected',
    actorId: reviewerId,
    timestamp: new Date().toISOString(),
    previousStatus: claim.status,
    newStatus: approved ? 'approved' : 'rejected',
    notes: notes ?? null,
  });

  const [updated] = await db
    .update(expenseClaims)
    .set({
      status: approved ? 'approved' : 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      notes: notes ?? null,
      auditHistory: updatedHistory,
    })
    .where(eq(expenseClaims.id, claimId))
    .returning();

  return updated;
};

export const markClaimPaid = async (
  claimId: number,
  paidByUserId: string,
  paymentProof?: string,
) => {
  const [claim] = await db.select().from(expenseClaims).where(eq(expenseClaims.id, claimId));
  if (!claim) throw new HTTPException(404, { message: 'Claim not found' });
  if (claim.status !== 'approved') {
    throw new HTTPException(400, { message: 'Only approved claims can be marked as paid' });
  }

  // Check committee closed
  const [evtForCommittee] = await db
    .select({ committeeNumber: events.committeeNumber })
    .from(events)
    .where(eq(events.id, claim.eventId));
  if (evtForCommittee) await assertCommitteeOpen(evtForCommittee.committeeNumber);

  // Check lock
  const [evtForPay] = await db
    .select({ financesLocked: events.financesLocked })
    .from(events)
    .where(eq(events.id, claim.eventId));
  if (evtForPay?.financesLocked)
    throw new HTTPException(403, { message: 'Finances are locked for this event' });

  const updatedHistory: any = claim.auditHistory || [];
  updatedHistory.push({
    action: 'paid',
    actorId: paidByUserId,
    timestamp: new Date().toISOString(),
    previousStatus: claim.status,
    newStatus: 'paid',
  });

  const [updated] = await db
    .update(expenseClaims)
    .set({
      status: 'paid',
      paidBy: paidByUserId,
      paidAt: new Date(),
      paymentProof: paymentProof ?? null,
      auditHistory: updatedHistory,
    })
    .where(eq(expenseClaims.id, claimId))
    .returning();

  // Auto-create a corresponding expense record for the paid claim
  await db.insert(eventExpenses).values({
    eventId: claim.eventId,
    description: `[Reimbursement] ${claim.description}`,
    amount: claim.amount,
    category: 'reimbursement',
    receiptImage: claim.proofImage,
    submittedBy: claim.userId,
  });

  return updated;
};

export const updateExpenseClaim = async (
  claimId: number,
  userId: string,
  data: { description?: string; amount?: number; proofImage?: string },
) => {
  const [claim] = await db.select().from(expenseClaims).where(eq(expenseClaims.id, claimId));
  if (!claim) throw new HTTPException(404, { message: 'Claim not found' });

  if (claim.userId !== userId) {
    throw new HTTPException(403, { message: 'Only the creator of the claim can edit it' });
  }

  if (claim.status !== 'rejected' && claim.status !== 'pending') {
    throw new HTTPException(400, { message: `Claim is already ${claim.status} and cannot be edited` });
  }

  const [event] = await db.select().from(events).where(eq(events.id, claim.eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);
  if (event.financesLocked) {
    throw new HTTPException(403, { message: 'Finances are locked for this event' });
  }

  const updatedHistory: any = claim.auditHistory || [];
  updatedHistory.push({
    action: 'updated',
    actorId: userId,
    timestamp: new Date().toISOString(),
    previousStatus: claim.status,
    newStatus: 'pending',
    changes: {
      description: data.description !== claim.description ? data.description : undefined,
      amount: data.amount !== claim.amount ? data.amount : undefined,
      proofImage: data.proofImage !== claim.proofImage ? data.proofImage : undefined,
    },
  });

  const [updated] = await db
    .update(expenseClaims)
    .set({
      description: data.description ?? claim.description,
      amount: data.amount ?? claim.amount,
      proofImage: data.proofImage ?? claim.proofImage,
      status: 'pending',
      auditHistory: updatedHistory,
    })
    .where(eq(expenseClaims.id, claimId))
    .returning();

  return updated;
};

export const deleteExpenseClaim = async (claimId: number, actorId: string) => {
  const [claim] = await db.select().from(expenseClaims).where(eq(expenseClaims.id, claimId));
  if (!claim) throw new HTTPException(404, { message: 'Claim not found' });

  const [event] = await db.select().from(events).where(eq(events.id, claim.eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);
  if (event.financesLocked) {
    throw new HTTPException(403, { message: 'Finances are locked for this event' });
  }

  const updatedHistory: any = claim.auditHistory || [];
  updatedHistory.push({
    action: 'deleted',
    actorId,
    timestamp: new Date().toISOString(),
    previousStatus: claim.status,
    newStatus: 'deleted',
  });

  const [updated] = await db
    .update(expenseClaims)
    .set({
      status: 'deleted',
      auditHistory: updatedHistory,
    })
    .where(eq(expenseClaims.id, claimId))
    .returning();

  return updated;
};

export const getEventClaims = async (eventId: number) => {
  const claimerAlias = users;
  return db
    .select({
      id: expenseClaims.id,
      eventId: expenseClaims.eventId,
      userId: expenseClaims.userId,
      userName: claimerAlias.name,
      description: expenseClaims.description,
      amount: expenseClaims.amount,
      proofImage: expenseClaims.proofImage,
      status: expenseClaims.status,
      submittedAt: expenseClaims.submittedAt,
      reviewedBy: expenseClaims.reviewedBy,
      reviewedAt: expenseClaims.reviewedAt,
      notes: expenseClaims.notes,
      paidBy: expenseClaims.paidBy,
      paidAt: expenseClaims.paidAt,
      paymentProof: expenseClaims.paymentProof,
      auditHistory: expenseClaims.auditHistory,
    })
    .from(expenseClaims)
    .leftJoin(claimerAlias, eq(expenseClaims.userId, claimerAlias.id))
    .where(and(eq(expenseClaims.eventId, eventId), ne(expenseClaims.status, 'deleted')))
    .orderBy(desc(expenseClaims.submittedAt));
};

export const getMyClaims = async (userId: string) => {
  return db
    .select({
      id: expenseClaims.id,
      eventId: expenseClaims.eventId,
      eventTitle: events.title,
      description: expenseClaims.description,
      amount: expenseClaims.amount,
      proofImage: expenseClaims.proofImage,
      status: expenseClaims.status,
      submittedAt: expenseClaims.submittedAt,
      notes: expenseClaims.notes,
      paidAt: expenseClaims.paidAt,
      paymentProof: expenseClaims.paymentProof,
      auditHistory: expenseClaims.auditHistory,
    })
    .from(expenseClaims)
    .innerJoin(events, eq(expenseClaims.eventId, events.id))
    .where(and(eq(expenseClaims.userId, userId), ne(expenseClaims.status, 'deleted')))
    .orderBy(desc(expenseClaims.submittedAt));
};

// ─── Event Financials (server-side calculation) ───

export const getEventFinancials = async (eventId: number) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  // Revenue calculation
  let totalRevenue = 0;
  let verifiedCount = 0;
  if (event.isDonation) {
    // For donation events: sum of verified donation amounts
    const [donationResult] = await db
      .select({ total: sum(eventRegistrations.donationAmount), count: count() })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.paymentStatus, 'verified'),
        ),
      );
    totalRevenue = Number(donationResult?.total ?? 0);
    verifiedCount = donationResult?.count ?? 0;
  } else if (event.isPaid) {
    // For paid events: count of verified registrations × fee
    const [revenueResult] = await db
      .select({ count: count() })
      .from(eventRegistrations)
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          eq(eventRegistrations.paymentStatus, 'verified'),
        ),
      );
    verifiedCount = revenueResult?.count ?? 0;
    totalRevenue = verifiedCount * (event.fee ?? 0);
  }

  // Base expenses: sum of all event expenses
  const [expenseResult] = await db
    .select({ total: sum(eventExpenses.amount) })
    .from(eventExpenses)
    .where(eq(eventExpenses.eventId, eventId));
  const baseExpense = Number(expenseResult?.total ?? 0);

  const refundEnabled = event.status === 'cancelled' && (event.isPaid || event.isDonation);
  let totalRefunded = 0;
  let refundOutflow = 0;
  let paidRefundCases = 0;

  // Refund outflow applies only for cancelled paid events.
  if (refundEnabled) {
    const [refundResult] = await db
      .select({
        refundedAmount: sum(refundRequests.refundAmount),
        paidCount: count(),
      })
      .from(refundRequests)
      .where(
        and(
          eq(refundRequests.eventId, eventId),
          or(eq(refundRequests.status, 'paid'), eq(refundRequests.status, 'confirmed')),
        ),
      );

    totalRefunded = Number(refundResult?.refundedAmount ?? 0);
    refundOutflow = totalRefunded;
    paidRefundCases = refundResult?.paidCount ?? 0;
  }

  // Final expense includes regular event expenses + refund outflow
  const totalExpense = baseExpense + refundOutflow;

  // Club subsidy = how much the club had to put in from its own budget
  const clubSubsidy = Math.max(0, totalExpense - totalRevenue);

  // Net = revenue - expense (negative means club subsidized)
  const netAmount = totalRevenue - totalExpense;

  // Pending claims
  const [pendingResult] = await db
    .select({ count: count(), total: sum(expenseClaims.amount) })
    .from(expenseClaims)
    .where(and(eq(expenseClaims.eventId, eventId), eq(expenseClaims.status, 'pending')));

  return {
    eventId,
    eventTitle: event.title,
    committeeNumber: event.committeeNumber,
    estimatedBudget: event.estimatedBudget ?? 0,
    allocatedBudget: event.allocatedBudget ?? 0,
    totalRevenue,
    baseExpense,
    totalRefunded,
    refundOutflow,
    paidRefundCases,
    totalExpense,
    clubSubsidy,
    netAmount,
    verifiedRegistrations: verifiedCount,
    fee: event.fee ?? 0,
    pendingClaims: pendingResult?.count ?? 0,
    pendingClaimsAmount: Number(pendingResult?.total ?? 0),
    financesLocked: event.financesLocked ?? false,
    financesLockedBy: event.financesLockedBy ?? null,
    financesLockedAt: event.financesLockedAt?.toISOString() ?? null,
  };
};

// ─── Voucher Generation ───

export const generateVoucher = async (eventId: number, userId: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);

  // Check if voucher already exists for this event
  const [existing] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.eventId, eventId), eq(vouchers.type, 'event_summary')));
  if (existing) {
    throw new HTTPException(409, {
      message: 'A voucher has already been generated for this event',
    });
  }

  // Calculate financials
  const financials = await getEventFinancials(eventId);

  // Get expense breakdown
  const expenseList = await getEventExpenses(eventId);

  // Get claim summary
  const claimList = await getEventClaims(eventId);

  // Generate voucher number: IIUC-CC-{YEAR}-{sequential}
  const year = getBangladeshYear();
  const [countResult] = await db.select({ count: count() }).from(vouchers);
  const seq = (countResult?.count ?? 0) + 1;
  const voucherNumber = `IIUC-CC-${year}-${String(seq).padStart(4, '0')}`;

  const [voucher] = await db
    .insert(vouchers)
    .values({
      eventId,
      voucherNumber,
      type: 'event_summary',
      totalRevenue: financials.totalRevenue,
      totalExpense: financials.totalExpense,
      clubSubsidy: financials.clubSubsidy,
      netAmount: financials.netAmount,
      data: {
        event: {
          id: event.id,
          title: event.title,
          committeeNumber: event.committeeNumber,
          eventDate: event.eventDate,
          venue: event.venue,
          isPaid: event.isPaid,
          fee: event.fee,
          estimatedBudget: event.estimatedBudget,
        },
        financials,
        expenses: expenseList,
        claims: claimList.map((c) => ({
          id: c.id,
          userName: c.userName,
          description: c.description,
          amount: c.amount,
          status: c.status,
        })),
        generatedAt: new Date().toISOString(),
      },
      generatedBy: userId,
    })
    .returning();

  return voucher;
};

export const regenerateVoucher = async (eventId: number, userId: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  const [existing] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.eventId, eventId), eq(vouchers.type, 'event_summary')));
  if (!existing) throw new HTTPException(404, { message: 'No voucher exists to regenerate' });

  const financials = await getEventFinancials(eventId);
  const expenseList = await getEventExpenses(eventId);
  const claimList = await getEventClaims(eventId);

  const [voucher] = await db
    .update(vouchers)
    .set({
      totalRevenue: financials.totalRevenue,
      totalExpense: financials.totalExpense,
      clubSubsidy: financials.clubSubsidy,
      netAmount: financials.netAmount,
      data: {
        event: {
          id: event.id,
          title: event.title,
          committeeNumber: event.committeeNumber,
          eventDate: event.eventDate,
          venue: event.venue,
          isPaid: event.isPaid,
          fee: event.fee,
          estimatedBudget: event.estimatedBudget,
        },
        financials,
        expenses: expenseList,
        claims: claimList.map((c) => ({
          id: c.id,
          userName: c.userName,
          description: c.description,
          amount: c.amount,
          status: c.status,
        })),
        generatedAt: new Date().toISOString(),
      },
      generatedBy: userId,
      generatedAt: new Date(),
    })
    .where(eq(vouchers.id, existing.id))
    .returning();

  return voucher;
};

export const getEventVoucher = async (eventId: number) => {
  const [voucher] = await db
    .select()
    .from(vouchers)
    .where(and(eq(vouchers.eventId, eventId), eq(vouchers.type, 'event_summary')));
  return voucher ?? null;
};

// ─── Lock / Unlock Event Finances ───

export const toggleFinancesLock = async (eventId: number, userId: string, lock: boolean) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  await assertCommitteeOpen(event.committeeNumber);

  if (lock && event.financesLocked) {
    throw new HTTPException(400, { message: 'Finances are already locked' });
  }
  if (!lock && !event.financesLocked) {
    throw new HTTPException(400, { message: 'Finances are not locked' });
  }

  const [updated] = await db
    .update(events)
    .set({
      financesLocked: lock,
      financesLockedBy: lock ? userId : null,
      financesLockedAt: lock ? new Date() : null,
    })
    .where(eq(events.id, eventId))
    .returning();

  return updated;
};
