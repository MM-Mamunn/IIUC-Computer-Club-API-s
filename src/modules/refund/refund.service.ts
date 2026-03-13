import { db } from '../../config/db';
import { refundRequests } from '../../db/event.schema';
import { events, eventRegistrations } from '../../db/event.schema';
import { users } from '../../db/schema';
import { eq, and, desc, or } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { sendRefundOpenedEmail, sendRefundStatusEmail } from '../../utils/email';

// ─── Statuses ───
export type RefundStatus =
  | 'pending_destination'
  | 'destination_submitted'
  | 'approved'
  | 'rejected'
  | 'paid'
  | 'confirmed';

// ─────────────────────────────────────────────────────────────
// Auto-create refund cases for all verified paid registrations
// Called from event.service.ts when an event is cancelled.
// ─────────────────────────────────────────────────────────────
export const createRefundCasesForEvent = async (eventId: number) => {
  // Fetch the event to get the fee
  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event || !event.isPaid) return; // Only for paid events

  // Get all verified registrations
  const regs = await db
    .select({
      userId: eventRegistrations.userId,
      paymentMethod: eventRegistrations.paymentMethod,
      transactionId: eventRegistrations.transactionId,
    })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        eq(eventRegistrations.paymentStatus, 'verified'),
      ),
    );

  if (regs.length === 0) return;

  // Insert refund cases (ignore if already exists via unique constraint)
  await db
    .insert(refundRequests)
    .values(
      regs.map((r) => ({
        eventId,
        userId: r.userId,
        refundAmount: event.fee ?? 0,
        subsidyAmount: 0, // Set when student picks refund method
        originalPaymentMethod: r.paymentMethod ?? null,
        originalTransactionId: r.transactionId ?? null,
        status: 'pending_destination' as const,
      })),
    )
    .onConflictDoNothing();

  // Notify students (fire-and-forget)
  const studentRows = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(or(...regs.map((r) => eq(users.id, r.userId))));

  for (const s of studentRows) {
    sendRefundOpenedEmail(s.email, s.name, event.title, event.fee ?? 0).catch(() => {});
  }
};

// ─────────────────────────────────────────────────────────────
// List all refund requests (admin/treasurer view)
// ─────────────────────────────────────────────────────────────
export const listRefunds = async (eventId?: number, status?: string) => {
  const rows = await db
    .select({
      id: refundRequests.id,
      eventId: refundRequests.eventId,
      userId: refundRequests.userId,
      refundAmount: refundRequests.refundAmount,
      subsidyAmount: refundRequests.subsidyAmount,
      originalPaymentMethod: refundRequests.originalPaymentMethod,
      originalTransactionId: refundRequests.originalTransactionId,
      refundMethod: refundRequests.refundMethod,
      refundAccountNumber: refundRequests.refundAccountNumber,
      refundAccountOwnerName: refundRequests.refundAccountOwnerName,
      isDifferentFromPayer: refundRequests.isDifferentFromPayer,
      studentDeclarationAccepted: refundRequests.studentDeclarationAccepted,
      studentDeclarationAcceptedAt: refundRequests.studentDeclarationAcceptedAt,
      status: refundRequests.status,
      reviewedBy: refundRequests.reviewedBy,
      reviewedAt: refundRequests.reviewedAt,
      adminNotes: refundRequests.adminNotes,
      rejectionReason: refundRequests.rejectionReason,
      processedBy: refundRequests.processedBy,
      processedAt: refundRequests.processedAt,
      refundTransactionRef: refundRequests.refundTransactionRef,
      proofUrl: refundRequests.proofUrl,
      confirmedAt: refundRequests.confirmedAt,
      createdAt: refundRequests.createdAt,
      updatedAt: refundRequests.updatedAt,
      // Join columns
      studentName: users.name,
      studentEmail: users.email,
      eventTitle: events.title,
      eventFee: events.fee,
    })
    .from(refundRequests)
    .innerJoin(users, eq(refundRequests.userId, users.id))
    .innerJoin(events, eq(refundRequests.eventId, events.id))
    .where(
      and(
        eventId ? eq(refundRequests.eventId, eventId) : undefined,
        status ? eq(refundRequests.status, status) : undefined,
      ),
    )
    .orderBy(desc(refundRequests.createdAt));

  return rows;
};

// ─────────────────────────────────────────────────────────────
// List refund requests for the logged-in student
// ─────────────────────────────────────────────────────────────
export const listMyRefunds = async (userId: string) => {
  const rows = await db
    .select({
      id: refundRequests.id,
      eventId: refundRequests.eventId,
      refundAmount: refundRequests.refundAmount,
      subsidyAmount: refundRequests.subsidyAmount,
      originalPaymentMethod: refundRequests.originalPaymentMethod,
      refundMethod: refundRequests.refundMethod,
      refundAccountNumber: refundRequests.refundAccountNumber,
      refundAccountOwnerName: refundRequests.refundAccountOwnerName,
      isDifferentFromPayer: refundRequests.isDifferentFromPayer,
      status: refundRequests.status,
      rejectionReason: refundRequests.rejectionReason,
      refundTransactionRef: refundRequests.refundTransactionRef,
      proofUrl: refundRequests.proofUrl,
      confirmedAt: refundRequests.confirmedAt,
      createdAt: refundRequests.createdAt,
      updatedAt: refundRequests.updatedAt,
      // Event info
      eventTitle: events.title,
      eventFee: events.fee,
      eventDate: events.eventDate,
    })
    .from(refundRequests)
    .innerJoin(events, eq(refundRequests.eventId, events.id))
    .where(eq(refundRequests.userId, userId))
    .orderBy(desc(refundRequests.createdAt));

  return rows;
};

// ─────────────────────────────────────────────────────────────
// Get a single refund request (with join data)
// ─────────────────────────────────────────────────────────────
export const getRefund = async (id: number) => {
  const [row] = await db
    .select({
      id: refundRequests.id,
      eventId: refundRequests.eventId,
      userId: refundRequests.userId,
      refundAmount: refundRequests.refundAmount,
      subsidyAmount: refundRequests.subsidyAmount,
      originalPaymentMethod: refundRequests.originalPaymentMethod,
      originalTransactionId: refundRequests.originalTransactionId,
      refundMethod: refundRequests.refundMethod,
      refundAccountNumber: refundRequests.refundAccountNumber,
      refundAccountOwnerName: refundRequests.refundAccountOwnerName,
      isDifferentFromPayer: refundRequests.isDifferentFromPayer,
      studentDeclarationAccepted: refundRequests.studentDeclarationAccepted,
      studentDeclarationAcceptedAt: refundRequests.studentDeclarationAcceptedAt,
      status: refundRequests.status,
      reviewedBy: refundRequests.reviewedBy,
      reviewedAt: refundRequests.reviewedAt,
      adminNotes: refundRequests.adminNotes,
      rejectionReason: refundRequests.rejectionReason,
      processedBy: refundRequests.processedBy,
      processedAt: refundRequests.processedAt,
      refundTransactionRef: refundRequests.refundTransactionRef,
      proofUrl: refundRequests.proofUrl,
      confirmedAt: refundRequests.confirmedAt,
      createdAt: refundRequests.createdAt,
      updatedAt: refundRequests.updatedAt,
      studentName: users.name,
      studentEmail: users.email,
      eventTitle: events.title,
      eventFee: events.fee,
    })
    .from(refundRequests)
    .innerJoin(users, eq(refundRequests.userId, users.id))
    .innerJoin(events, eq(refundRequests.eventId, events.id))
    .where(eq(refundRequests.id, id));

  if (!row) throw new HTTPException(404, { message: 'Refund request not found' });
  return row;
};

// ─────────────────────────────────────────────────────────────
// Student submits (or resubmits) refund destination
// ─────────────────────────────────────────────────────────────
export const submitDestination = async (
  id: number,
  userId: string,
  data: {
    refundMethod: string;
    refundAccountNumber?: string;
    refundAccountOwnerName?: string;
    isDifferentFromPayer?: boolean;
    declarationAccepted: boolean;
  },
) => {
  const [req] = await db.select().from(refundRequests).where(eq(refundRequests.id, id));
  if (!req) throw new HTTPException(404, { message: 'Refund request not found' });
  if (req.userId !== userId) throw new HTTPException(403, { message: 'Not your refund request' });

  const allowedStatuses: RefundStatus[] = ['pending_destination', 'rejected'];
  if (!allowedStatuses.includes(req.status as RefundStatus)) {
    throw new HTTPException(400, {
      message: `Cannot update destination — current status is "${req.status}"`,
    });
  }

  if (!data.declarationAccepted) {
    throw new HTTPException(400, { message: 'You must accept the declaration to proceed' });
  }

  const validMethods = ['bkash', 'nagad', 'cash', 'bank'];
  if (!validMethods.includes(data.refundMethod)) {
    throw new HTTPException(400, { message: 'Invalid refund method' });
  }

  if (data.refundMethod !== 'cash' && !data.refundAccountNumber) {
    throw new HTTPException(400, {
      message: 'Account number is required for non-cash refund methods',
    });
  }

  const [updated] = await db
    .update(refundRequests)
    .set({
      refundMethod: data.refundMethod,
      refundAccountNumber: data.refundMethod === 'cash' ? null : (data.refundAccountNumber ?? null),
      refundAccountOwnerName: data.refundAccountOwnerName ?? null,
      isDifferentFromPayer: data.isDifferentFromPayer ?? false,
      studentDeclarationAccepted: true,
      studentDeclarationAcceptedAt: new Date(),
      subsidyAmount: 0,
      // Simple flow: destination submission is auto-approved.
      status: 'approved',
      rejectionReason: null,
      reviewedBy: null,
      reviewedAt: null,
      adminNotes: null,
      updatedAt: new Date(),
    })
    .where(eq(refundRequests.id, id))
    .returning();

  return updated;
};

// ─────────────────────────────────────────────────────────────
// Admin / treasurer reviews a refund — approve or reject
// ─────────────────────────────────────────────────────────────
export const reviewRefund = async (
  id: number,
  reviewerId: string,
  action: 'approve' | 'reject',
  notes?: string,
  rejectionReason?: string,
) => {
  void id;
  void reviewerId;
  void action;
  void notes;
  void rejectionReason;
  throw new HTTPException(410, {
    message: 'Manual refund review is disabled. Destination submission is auto-approved.',
  });
};

// ─────────────────────────────────────────────────────────────
// Treasurer marks refund as paid (uploads proof)
// ─────────────────────────────────────────────────────────────
export const processRefund = async (
  id: number,
  processorId: string,
  data: {
    refundTransactionRef?: string;
    proofUrl?: string;
  },
) => {
  const [req] = await db.select().from(refundRequests).where(eq(refundRequests.id, id));
  if (!req) throw new HTTPException(404, { message: 'Refund request not found' });

  if (req.status !== 'approved' && req.status !== 'destination_submitted') {
    throw new HTTPException(400, {
      message: `Can only process a refund after destination submission (current: "${req.status}")`,
    });
  }

  const [updated] = await db
    .update(refundRequests)
    .set({
      status: 'confirmed',
      processedBy: processorId,
      processedAt: new Date(),
      refundTransactionRef: data.refundTransactionRef ?? null,
      proofUrl: data.proofUrl ?? null,
      confirmedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(refundRequests.id, id))
    .returning();

  // Notify student
  const [student] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, req.userId));
  const [event] = await db
    .select({ title: events.title })
    .from(events)
    .where(eq(events.id, req.eventId));

  if (student && event) {
    sendRefundStatusEmail(student.email, student.name, event.title, 'confirmed').catch(() => {});
  }

  return updated;
};

// ─────────────────────────────────────────────────────────────
// Student confirms they received the refund
// ─────────────────────────────────────────────────────────────
export const confirmRefund = async (id: number, userId: string) => {
  void id;
  void userId;
  throw new HTTPException(410, {
    message: 'Student confirmation is disabled. Refund is finalized when staff marks it processed.',
  });
};
