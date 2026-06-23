import {
  pgTable,
  varchar,
  text,
  timestamp,
  date,
  primaryKey,
  doublePrecision,
  integer,
  boolean,
  serial,
} from 'drizzle-orm/pg-core';

/* =========================
   POSITION TABLE
========================= */
export const positions = pgTable('position', {
  position: varchar('position', { length: 255 }).primaryKey(),

  description: text('description'),
});

/* =========================
   ROLE TABLE
========================= */
export const roles = pgTable('role', {
  role: varchar('role', { length: 255 }).primaryKey(),
  // ✅ New column
  priority: integer('priority').notNull().default(1),
  description: text('description'),
});

export const committee = pgTable('committee', {
  number: varchar('number', { length: 255 }).primaryKey(),

  gender: varchar('gender', { length: 20 }).notNull().default('male'),

  start: date('start').notNull(),

  session: varchar('session', { length: 100 }).notNull(),

  end: date('end'),

  beginningBudget: doublePrecision('beginning_budget'),

  description: text('description'),
});
/* =========================
   USERS TABLE
========================= */
export const users = pgTable('users', {
  id: varchar('id', { length: 255 }).primaryKey().notNull(),
  name: varchar('name', { length: 255 }).notNull(),

  gender: varchar('gender', { length: 20 }).notNull().default('male'),

  email: varchar('email', { length: 255 }).notNull().unique(),

  password: text('password').notNull(),

  description: text('description'),

  profileImage: text('profile_image'),

  idCard: text('id_card'),

  department: varchar('department', { length: 100 }),

  /** When true, user must change password before accessing dashboard */
  mustChangePassword: boolean('must_change_password').notNull().default(false),

  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow(),
});

export const executives = pgTable(
  'executives',
  {
    id: varchar('id', { length: 255 })
      .notNull()
      .references(() => users.id, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    number: varchar('number', { length: 255 })
      .notNull()
      .references(() => committee.number, {
        onDelete: 'cascade',
        onUpdate: 'cascade',
      }),

    role: varchar('role', { length: 255 }).references(() => roles.role, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    position: varchar('position', { length: 255 }).references(() => positions.position, {
      onDelete: 'restrict',
      onUpdate: 'cascade',
    }),

    assignedBy: varchar('assigned_by', { length: 255 }).references(() => users.id, {
      onDelete: 'set null',
      onUpdate: 'cascade',
    }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.number] }),
  }),
);

/* =========================
   NEWSLETTER SUBSCRIPTIONS
========================= */
export const newsletterSubscriptions = pgTable('newsletter_subscriptions', {
  id: serial('id').primaryKey(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  isActive: boolean('is_active').notNull().default(true),
  source: varchar('source', { length: 50 }).notNull().default('landing-footer'),
  subscribedAt: timestamp('subscribed_at', { withTimezone: true }).notNull().defaultNow(),
});
