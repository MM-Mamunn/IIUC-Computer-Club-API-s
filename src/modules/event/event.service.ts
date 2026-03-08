import { db } from '../../config/db';
import {
  events,
  eventRegistrations,
  eventDuties,
  eventManagers,
  eventExpenses,
  expenseClaims,
  vouchers,
} from '../../db/event.schema';
import { users } from '../../db/schema';
import { eq, desc, and, sql, count, sum } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { hashPassword } from '../../utils/hash';
import {
  generateTempPassword,
  sendWelcomeEmail,
  sendEventRegistrationEmail,
  sendPaymentConfirmedEmail,
} from '../../utils/email';

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
    fee?: number;
    maxParticipants?: number;
    bannerImage?: string;
    paymentNumbers?: { bkash?: string[]; nagad?: string[] };
    sslcommerzEnabled?: boolean;
    customFields?: unknown;
    estimatedBudget?: number;
  },
  c: Context,
) => {
  const user = c.get('user');
  if (!data.title || !data.committeeNumber || !data.eventDate) {
    throw new HTTPException(400, { message: 'title, committeeNumber, and eventDate are required' });
  }

  const [event] = await db
    .insert(events)
    .values({
      title: data.title,
      description: data.description ?? null,
      committeeNumber: data.committeeNumber,
      eventDate: new Date(data.eventDate),
      registrationDeadline: data.registrationDeadline ? new Date(data.registrationDeadline) : null,
      venue: data.venue ?? null,
      isPaid: data.isPaid ?? false,
      fee: data.fee ?? 0,
      maxParticipants: data.maxParticipants ?? null,
      bannerImage: data.bannerImage ?? null,
      status: 'upcoming',
      paymentNumbers: data.paymentNumbers ?? null,
      sslcommerzEnabled: data.sslcommerzEnabled ?? false,
      customFields: data.customFields ?? null,
      createdBy: user.id,
      estimatedBudget: data.estimatedBudget ?? 0,
    })
    .returning();

  return event;
};

// ─── List Events ───
export const listEvents = async (committeeNumber?: string, status?: string) => {
  let query = db.select().from(events).orderBy(desc(events.eventDate)).$dynamic();

  const conditions = [];
  if (committeeNumber) conditions.push(eq(events.committeeNumber, committeeNumber));
  if (status) conditions.push(eq(events.status, status));

  if (conditions.length > 0) {
    query = query.where(and(...conditions));
  }

  return query;
};

// ─── Get Single Event with registration count ───
export const getEventById = async (id: number) => {
  const [event] = await db.select().from(events).where(eq(events.id, id));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  const [regCount] = await db
    .select({ count: count() })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.eventId, id));

  return { ...event, registrationCount: regCount?.count ?? 0 };
};

// ─── Update Event ───
export const updateEvent = async (id: number, data: Record<string, unknown>) => {
  const [existing] = await db.select().from(events).where(eq(events.id, id));
  if (!existing) throw new HTTPException(404, { message: 'Event not found' });

  // Whitelist of allowed fields
  const allowed = new Set([
    'title',
    'description',
    'eventDate',
    'registrationDeadline',
    'venue',
    'isPaid',
    'fee',
    'maxParticipants',
    'bannerImage',
    'status',
    'paymentNumbers',
    'sslcommerzEnabled',
    'customFields',
    'estimatedBudget',
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

  if (Object.keys(updateData).length === 0) {
    throw new HTTPException(400, { message: 'No fields to update' });
  }

  const [updated] = await db.update(events).set(updateData).where(eq(events.id, id)).returning();
  return updated;
};

// ─── Delete Event ───
export const deleteEvent = async (id: number) => {
  const [existing] = await db.select().from(events).where(eq(events.id, id));
  if (!existing) throw new HTTPException(404, { message: 'Event not found' });

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
) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  if (event.status === 'cancelled') throw new HTTPException(400, { message: 'Event is cancelled' });
  if (event.status === 'completed')
    throw new HTTPException(400, { message: 'Event has already completed' });

  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new HTTPException(400, { message: 'Registration deadline has passed' });
  }

  // Check max participants
  if (event.maxParticipants) {
    const [regCount] = await db
      .select({ count: count() })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId));
    if ((regCount?.count ?? 0) >= event.maxParticipants) {
      throw new HTTPException(400, { message: 'Event is full' });
    }
  }

  // Check already registered
  const [existing] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (existing) throw new HTTPException(409, { message: 'Already registered for this event' });

  // For paid events with manual payment, require transaction ID
  if (event.isPaid && paymentMethod && paymentMethod !== 'sslcommerz' && !transactionId) {
    throw new HTTPException(400, { message: 'Transaction ID is required for manual payment' });
  }

  let paymentStatus = 'free';
  if (event.isPaid) {
    paymentStatus =
      paymentMethod === 'sslcommerz' ? 'pending' : transactionId ? 'pending' : 'pending';
  }

  const [reg] = await db
    .insert(eventRegistrations)
    .values({
      eventId,
      userId,
      paymentStatus,
      paymentMethod: event.isPaid ? (paymentMethod ?? null) : null,
      transactionId: transactionId ?? null,
      customFieldResponses: customFieldResponses ?? null,
    })
    .returning();

  // Send registration confirmation email (async, don't block)
  const [regUser] = await db
    .select({ name: users.name, email: users.email })
    .from(users)
    .where(eq(users.id, userId));
  if (regUser) {
    sendEventRegistrationEmail(
      regUser.email,
      regUser.name,
      event.title,
      event.eventDate.toISOString(),
      event.venue,
      event.isPaid,
      event.fee ?? 0,
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
    customFieldResponses?: unknown;
    paymentMethod?: string;
    transactionId?: string;
  },
) => {
  // Validate gender
  if (data.gender !== 'male' && data.gender !== 'female') {
    throw new HTTPException(400, { message: "Invalid gender. Please specify 'male' or 'female'" });
  }

  // Check if event exists and is open
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  if (event.status === 'cancelled') throw new HTTPException(400, { message: 'Event is cancelled' });
  if (event.status === 'completed')
    throw new HTTPException(400, { message: 'Event has already completed' });
  if (event.registrationDeadline && new Date(event.registrationDeadline) < new Date()) {
    throw new HTTPException(400, { message: 'Registration deadline has passed' });
  }

  // Check max participants
  if (event.maxParticipants) {
    const [regCount] = await db
      .select({ count: count() })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId));
    if ((regCount?.count ?? 0) >= event.maxParticipants) {
      throw new HTTPException(400, { message: 'Event is full' });
    }
  }

  const studentId = data.studentId.trim();
  const email = data.email.trim().toLowerCase();

  // Check if user already exists
  const [existingUser] = await db
    .select()
    .from(users)
    .where(eq(sql`upper(${users.id})`, studentId.toUpperCase()));

  if (existingUser) {
    throw new HTTPException(409, {
      message:
        'An account already exists with this Student ID. Please log in to register for this event.',
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

  // Create account with temp password
  const tempPassword = generateTempPassword();
  const hashed = await hashPassword(tempPassword);

  const [newUser] = await db
    .insert(users)
    .values({
      id: studentId,
      name: data.name.trim(),
      email,
      password: hashed,
      gender: data.gender,
      mustChangePassword: true,
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
  if (event.isPaid) {
    paymentStatus = 'pending';
  }

  // For paid events with manual payment, require transaction ID
  if (
    event.isPaid &&
    data.paymentMethod &&
    data.paymentMethod !== 'sslcommerz' &&
    !data.transactionId
  ) {
    throw new HTTPException(400, { message: 'Transaction ID is required for manual payment' });
  }

  const [reg] = await db
    .insert(eventRegistrations)
    .values({
      eventId,
      userId: studentId,
      paymentStatus,
      paymentMethod: event.isPaid ? (data.paymentMethod ?? null) : null,
      transactionId: data.transactionId ?? null,
      customFieldResponses: data.customFieldResponses ?? null,
    })
    .returning();

  // Send emails (async, don't block response)
  sendWelcomeEmail(email, data.name.trim(), studentId, tempPassword);
  sendEventRegistrationEmail(
    email,
    data.name.trim(),
    event.title,
    event.eventDate.toISOString(),
    event.venue,
    event.isPaid,
    event.fee ?? 0,
  );

  return { registration: reg, event };
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
    throw new HTTPException(400, { message: 'paymentMethod and transactionId are required' });
  }

  const [updated] = await db
    .update(eventRegistrations)
    .set({ paymentMethod, transactionId, paymentStatus: 'pending' })
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
    .returning();

  return updated;
};

// ─── Verify Payment (admin) ───
export const verifyPayment = async (eventId: number, userId: string, verified: boolean) => {
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (!reg) throw new HTTPException(404, { message: 'Registration not found' });

  const [updated] = await db
    .update(eventRegistrations)
    .set({ paymentStatus: verified ? 'verified' : 'failed' })
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)))
    .returning();

  // Send confirmation email when verified
  if (verified) {
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [event] = await db.select().from(events).where(eq(events.id, eventId));
    if (user?.email && event) {
      sendPaymentConfirmedEmail(
        user.email,
        user.name,
        event.title,
        event.eventDate.toISOString(),
        event.venue,
        event.fee ?? 0,
      );
    }
  }

  return updated;
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

  // Send confirmation email
  const [user] = await db.select().from(users).where(eq(users.id, reg.userId));
  const [event] = await db.select().from(events).where(eq(events.id, reg.eventId));
  if (user?.email && event) {
    sendPaymentConfirmedEmail(
      user.email,
      user.name,
      event.title,
      event.eventDate.toISOString(),
      event.venue,
      event.fee ?? 0,
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

  return { success: true, message: 'Unregistered successfully' };
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
      customFieldResponses: eventRegistrations.customFieldResponses,
    })
    .from(eventRegistrations)
    .innerJoin(users, eq(eventRegistrations.userId, users.id))
    .where(eq(eventRegistrations.eventId, eventId));

  return registrations;
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

  const [userExists] = await db.select().from(users).where(eq(users.id, userId));
  if (!userExists) throw new HTTPException(404, { message: 'User not found' });

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

  return dutyRecord;
};

// ─── Remove Duty ───
export const removeDuty = async (eventId: number, userId: string, duty: string) => {
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
      fee: events.fee,
      registeredAt: eventRegistrations.registeredAt,
      paymentStatus: eventRegistrations.paymentStatus,
      paymentMethod: eventRegistrations.paymentMethod,
      transactionId: eventRegistrations.transactionId,
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

  const [userExists] = await db.select().from(users).where(eq(users.id, userId));
  if (!userExists) throw new HTTPException(404, { message: 'User not found' });

  const [existing] = await db
    .select()
    .from(eventManagers)
    .where(and(eq(eventManagers.eventId, eventId), eq(eventManagers.userId, userId)));
  if (existing)
    throw new HTTPException(409, { message: 'User is already a manager for this event' });

  const [row] = await db.insert(eventManagers).values({ eventId, userId, assignedBy }).returning();
  return row;
};

/** Remove a user as manager for a specific event. */
export const removeEventManager = async (eventId: number, userId: string) => {
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
  if (claim.status !== 'pending') {
    throw new HTTPException(400, { message: `Claim is already ${claim.status}` });
  }

  const [updated] = await db
    .update(expenseClaims)
    .set({
      status: approved ? 'approved' : 'rejected',
      reviewedBy: reviewerId,
      reviewedAt: new Date(),
      notes: notes ?? null,
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

  const [updated] = await db
    .update(expenseClaims)
    .set({
      status: 'paid',
      paidBy: paidByUserId,
      paidAt: new Date(),
      paymentProof: paymentProof ?? null,
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
    })
    .from(expenseClaims)
    .leftJoin(claimerAlias, eq(expenseClaims.userId, claimerAlias.id))
    .where(eq(expenseClaims.eventId, eventId))
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
    })
    .from(expenseClaims)
    .innerJoin(events, eq(expenseClaims.eventId, events.id))
    .where(eq(expenseClaims.userId, userId))
    .orderBy(desc(expenseClaims.submittedAt));
};

// ─── Event Financials (server-side calculation) ───

export const getEventFinancials = async (eventId: number) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

  // Revenue: count of verified paid registrations × fee
  const [revenueResult] = await db
    .select({ count: count() })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.paymentStatus, 'verified'),
      ),
    );
  const verifiedCount = revenueResult?.count ?? 0;
  const totalRevenue = event.isPaid ? verifiedCount * (event.fee ?? 0) : 0;

  // Expenses: sum of all event expenses
  const [expenseResult] = await db
    .select({ total: sum(eventExpenses.amount) })
    .from(eventExpenses)
    .where(eq(eventExpenses.eventId, eventId));
  const totalExpense = Number(expenseResult?.total ?? 0);

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
    totalRevenue,
    totalExpense,
    clubSubsidy,
    netAmount,
    verifiedRegistrations: verifiedCount,
    fee: event.fee ?? 0,
    pendingClaims: pendingResult?.count ?? 0,
    pendingClaimsAmount: Number(pendingResult?.total ?? 0),
  };
};

// ─── Voucher Generation ───

export const generateVoucher = async (eventId: number, userId: string) => {
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });

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
  const year = new Date().getFullYear();
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
