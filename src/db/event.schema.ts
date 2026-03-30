import {
  pgTable,
  varchar,
  text,
  timestamp,
  date,
  doublePrecision,
  boolean,
  integer,
  primaryKey,
  serial,
  jsonb,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { users, committee } from './schema';

/* =========================
   EVENTS TABLE
========================= */
export const events = pgTable('events', {
  id: serial('id').primaryKey(),

  title: varchar('title', { length: 500 }).notNull(),

  description: text('description'),

  /** Which committee is hosting this event */
  committeeNumber: varchar('committee_number', { length: 255 })
    .notNull()
    .references(() => committee.number, {
      onDelete: 'cascade',
      onUpdate: 'cascade',
    }),

  /** Event date/time */
  eventDate: timestamp('event_date', { withTimezone: true }).notNull(),

  /** Registration deadline */
  registrationDeadline: timestamp('registration_deadline', { withTimezone: true }),

  /** Location/venue */
  venue: varchar('venue', { length: 500 }),

  /** Is it a paid event? */
  isPaid: boolean('is_paid').notNull().default(false),

  /** Is it a donation/charity event? (pay-what-you-want) */
  isDonation: boolean('is_donation').notNull().default(false),

  /** Fee amount (0 if free, suggested minimum if donation) */
  fee: doublePrecision('fee').default(0),

  /** Max participants (null = unlimited) */
  maxParticipants: integer('max_participants'),

  /** Event banner/image URL */
  bannerImage: text('banner_image'),

  /** Event status */
  status: varchar('status', { length: 20 }).notNull().default('upcoming'),

  /** Whether this event should be highlighted on public pages */
  isFeatured: boolean('is_featured').notNull().default(false),

  /**
   * Manual payment numbers for bKash / Nagad.
   * Stored as JSON: { bkash: string[], nagad: string[] }
   */
  paymentNumbers: jsonb('payment_numbers'),

  /** Whether SSLCommerz auto-payment is enabled for this event */
  sslcommerzEnabled: boolean('sslcommerz_enabled').notNull().default(false),

  /**
   * Custom registration form fields (Google Forms style).
   * Stored as JSON array of field definitions:
   * [{ id, type, label, required, description?, placeholder?, options?, validation? }]
   */
  customFields: jsonb('custom_fields'),

  /**
   * Gender restriction for participation:
   * 'male' = only male students can register
   * 'female' = only female students can register
   * 'both' = anyone can register
   */
  genderRestriction: varchar('gender_restriction', { length: 10 }).notNull().default('both'),

  /** Who created the event */
  createdBy: varchar('created_by', { length: 255 })
    .notNull()
    .references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

  /** Estimated budget for putting on this event */
  estimatedBudget: doublePrecision('estimated_budget').default(0),

  /** Actual budget allocated/received from authority */
  allocatedBudget: doublePrecision('allocated_budget').default(0),

  /** Whether finances for this event are locked (no more edits) */
  financesLocked: boolean('finances_locked').notNull().default(false),

  /** Who locked the finances */
  financesLockedBy: varchar('finances_locked_by', { length: 255 }).references(() => users.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),

  /** When the finances were locked */
  financesLockedAt: timestamp('finances_locked_at', { withTimezone: true }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/* =========================
   EVENT REGISTRATIONS TABLE
========================= */
export const eventRegistrations = pgTable(
  'event_registrations',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    registeredAt: timestamp('registered_at', { withTimezone: true }).defaultNow(),

    /** Payment status for paid events: free | pending | verified | failed */
    paymentStatus: varchar('payment_status', { length: 20 }).default('pending'),

    /** How the user paid: bkash | nagad | sslcommerz | null (for free) */
    paymentMethod: varchar('payment_method', { length: 30 }),

    /** Transaction ID submitted by user (manual payment) */
    transactionId: varchar('transaction_id', { length: 255 }),

    /** Donation amount for charity events (user-chosen) */
    donationAmount: doublePrecision('donation_amount'),

    /** SSLCommerz validation ID for auto-verification */
    sslcommerzValId: varchar('sslcommerz_val_id', { length: 255 }),

    /** SSLCommerz unique transaction ID we generated */
    sslcommerzTranId: varchar('sslcommerz_tran_id', { length: 255 }),

    /** Stores partial form data so users can resume registration */
    draftData: jsonb('draft_data'),

    /**
     * Custom field responses submitted during registration.
     * Stored as JSON: { [fieldId]: value }
     * value can be string, string[], or number depending on field type.
     */
    customFieldResponses: jsonb('custom_field_responses'),

    /** Latest rejection reason (when admin rejects payment) */
    rejectionReason: varchar('rejection_reason', { length: 500 }),

    /** Type of the latest rejection: incorrect_trxid | incorrect_amount | other */
    rejectionType: varchar('rejection_type', { length: 30 }),

    /**
     * History of payment rejections.
     * Stored as JSON array: [{ reason, type, rejectedAt, transactionId, paymentMethod, amountDeficit? }]
     */
    rejectionHistory: jsonb('rejection_history'),

    /** Whether the fix-payment token has been used */
    fixPaymentUsed: boolean('fix_payment_used').default(false),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.userId] }),
  }),
);

/* =========================
   EVENT DUTIES TABLE
   (assign club members to duties for events)
========================= */
export const eventDuties = pgTable(
  'event_duties',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    /** What duty they are assigned to */
    duty: varchar('duty', { length: 500 }).notNull(),

    /** Additional notes */
    description: text('description'),

    assignedBy: varchar('assigned_by', { length: 255 }).references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.userId, table.duty] }),
  }),
);

/* =========================
   EVENT MANAGERS TABLE
   (delegate limited access to specific events)
========================= */
export const eventManagers = pgTable(
  'event_managers',
  {
    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    assignedBy: varchar('assigned_by', { length: 255 }).references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.eventId, table.userId] }),
  }),
);

/* =========================
   EVENT EXPENSES TABLE
   (track expenses incurred for an event)
========================= */
export const eventExpenses = pgTable('event_expenses', {
  id: serial('id').primaryKey(),

  eventId: integer('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  /** What was purchased / cost description */
  description: varchar('description', { length: 1000 }).notNull(),

  /** Amount spent (BDT) */
  amount: doublePrecision('amount').notNull(),

  /** Category: venue, logistics, food, printing, prizes, decoration, other */
  category: varchar('category', { length: 100 }).notNull().default('other'),

  /** Receipt image URL (Cloudinary) */
  receiptImage: text('receipt_image'),

  /** Who logged this expense */
  submittedBy: varchar('submitted_by', { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

/* =========================
   EXPENSE CLAIMS TABLE
   (members claim reimbursement for purchases made on behalf of club)
========================= */
export const expenseClaims = pgTable('expense_claims', {
  id: serial('id').primaryKey(),

  eventId: integer('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  /** Who is claiming reimbursement */
  userId: varchar('user_id', { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  /** What was purchased */
  description: varchar('description', { length: 1000 }).notNull(),

  /** Amount to reimburse (BDT) */
  amount: doublePrecision('amount').notNull(),

  /** Proof image URL (receipt/voucher photo) */
  proofImage: text('proof_image').notNull(),

  /** pending → approved → paid   OR   pending → rejected */
  status: varchar('status', { length: 20 }).notNull().default('pending'),

  submittedAt: timestamp('submitted_at', { withTimezone: true }).defaultNow(),

  /** Who reviewed (approved/rejected) this claim */
  reviewedBy: varchar('reviewed_by', { length: 255 }).references(() => users.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),

  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

  /** Optional reviewer notes */
  notes: text('notes'),

  /** Who marked this as paid */
  paidBy: varchar('paid_by', { length: 255 }).references(() => users.id, {
    onDelete: 'set null',
    onUpdate: 'cascade',
  }),

  paidAt: timestamp('paid_at', { withTimezone: true }),

  /** Proof of payment image URL (e.g. bank transfer screenshot) */
  paymentProof: text('payment_proof'),
});

/* =========================
   VOUCHERS TABLE
   (financial summary voucher for an event — for records & printing)
========================= */
export const vouchers = pgTable('vouchers', {
  id: serial('id').primaryKey(),

  eventId: integer('event_id')
    .notNull()
    .references(() => events.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

  /** Unique human-readable voucher number: e.g. IIUC-CC-2026-001 */
  voucherNumber: varchar('voucher_number', { length: 100 }).notNull().unique(),

  /** event_summary | expense_reimbursement */
  type: varchar('type', { length: 30 }).notNull().default('event_summary'),

  /** Revenue from paid registrations */
  totalRevenue: doublePrecision('total_revenue').notNull().default(0),

  /** Total expenses for the event */
  totalExpense: doublePrecision('total_expense').notNull().default(0),

  /** Club subsidy = max(0, totalExpense - totalRevenue) */
  clubSubsidy: doublePrecision('club_subsidy').notNull().default(0),

  /** Net amount = totalRevenue - totalExpense (negative = club subsidized) */
  netAmount: doublePrecision('net_amount').notNull().default(0),

  /** Full breakdown stored as JSON for PDF generation */
  data: jsonb('data'),

  /** Who generated this voucher */
  generatedBy: varchar('generated_by', { length: 255 })
    .notNull()
    .references(() => users.id, { onDelete: 'set null', onUpdate: 'cascade' }),

  generatedAt: timestamp('generated_at', { withTimezone: true }).defaultNow(),
});

/* =========================
   REFUND REQUESTS TABLE
   (Created when a paid event is cancelled — tracks full refund lifecycle)
========================= */
export const refundRequests = pgTable(
  'refund_requests',
  {
    id: serial('id').primaryKey(),

    eventId: integer('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    userId: varchar('user_id', { length: 255 })
      .notNull()
      .references(() => users.id, { onDelete: 'cascade', onUpdate: 'cascade' }),

    /** Full event fee — what the student will receive back */
    refundAmount: doublePrecision('refund_amount').notNull(),

    /**
     * Gateway fee covered by the club as subsidy.
     * bKash/Nagad send-money charge = ৳5, cash = ৳0.
     * Set when student submits refund destination.
     */
    subsidyAmount: doublePrecision('subsidy_amount').notNull().default(0),

    /** How the student originally paid: bkash | nagad | sslcommerz | cash | other */
    originalPaymentMethod: varchar('original_payment_method', { length: 30 }),

    /** Original transaction ID from registration */
    originalTransactionId: varchar('original_transaction_id', { length: 255 }),

    /** Chosen refund channel: bkash | nagad | cash | bank */
    refundMethod: varchar('refund_method', { length: 30 }),

    /** Wallet / bank account number for the refund */
    refundAccountNumber: varchar('refund_account_number', { length: 255 }),

    /** Name of the account holder */
    refundAccountOwnerName: varchar('refund_account_owner_name', { length: 255 }),

    /**
     * True when the refund destination account belongs to someone other
     * than the original payer (e.g. borrowed number).
     */
    isDifferentFromPayer: boolean('is_different_from_payer').notNull().default(false),

    /** Student checked the "I confirm this destination" declaration */
    studentDeclarationAccepted: boolean('student_declaration_accepted').notNull().default(false),

    studentDeclarationAcceptedAt: timestamp('student_declaration_accepted_at', {
      withTimezone: true,
    }),

    /**
     * Refund lifecycle status:
     * pending_destination → destination_submitted → approved | rejected
     * approved → paid → confirmed
     */
    status: varchar('status', { length: 30 }).notNull().default('pending_destination'),

    /** Executive who reviewed / approved / rejected the refund */
    reviewedBy: varchar('reviewed_by', { length: 255 }).references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),

    /** Admin notes visible only to staff */
    adminNotes: text('admin_notes'),

    /** Reason for rejection (shown to student) */
    rejectionReason: text('rejection_reason'),

    /** Who executed the refund transfer */
    processedBy: varchar('processed_by', { length: 255 }).references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),

    processedAt: timestamp('processed_at', { withTimezone: true }),

    /** Transaction reference of the actual refund (bKash TrxID etc.) */
    refundTransactionRef: varchar('refund_transaction_ref', { length: 255 }),

    /** Proof upload URL (screenshot of transfer / signed cash receipt) */
    proofUrl: text('proof_url'),

    /** When the student confirmed they received the refund */
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    uniq: uniqueIndex('refund_requests_event_user_uniq').on(table.eventId, table.userId),
  }),
);
