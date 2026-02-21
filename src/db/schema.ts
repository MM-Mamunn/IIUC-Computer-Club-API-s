import {
  pgTable,
  varchar,
  text,
  timestamp,
  date,
  primaryKey,
  doublePrecision
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/* =========================
   POSITION TABLE
========================= */
export const positions = pgTable("position", {
  position: varchar("position", { length: 255 })
    .primaryKey(),

  description: text("description"),
});


/* =========================
   ROLE TABLE
========================= */
export const roles = pgTable("role", {
  role: varchar("role", { length: 255 })
    .primaryKey(),

  description: text("description"),
});

export const committee = pgTable("committee", {
  number: varchar("number", { length: 255 })
    .primaryKey(),

  gender: varchar("gender", { length: 20 })
  .notNull()
  .default("male"),

  start: date("start")
    .notNull(),

  end: date("end"),

  beginningBudget: doublePrecision("beginning_budget"),

  description: text("description"),
});
/* =========================
   USERS TABLE
========================= */
export const users = pgTable("users", {
 id: varchar("id", { length: 255 })
    .primaryKey()
    .notNull(),
  name: varchar("name", { length: 255 })
    .notNull(),

  gender: varchar("gender", { length: 20 })
  .notNull()
  .default("male"),

  email: varchar("email", { length: 255 })
    .notNull()
    .unique(),

  password: text("password")
    .notNull(),
  
    description: text("description"),

  profileImage: text("profile_image"),

  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
});

export const executives = pgTable(
  "executives",
  {
    id: varchar("id", { length: 255 })
      .notNull()
      .references(() => users.id, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    committee: varchar("committee", { length: 255 })
      .notNull()
      .references(() => committee.number, {
        onDelete: "cascade",
        onUpdate: "cascade",
      }),

    role: varchar("role", { length: 255 })
      .references(() => roles.role, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),

    position: varchar("position", { length: 255 })
      .references(() => positions.position, {
        onDelete: "restrict",
        onUpdate: "cascade",
      }),

    assignedBy: varchar("assigned_by", { length: 255 })
      .references(() => users.id, {
        onDelete: "set null",
        onUpdate: "cascade",
      }),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.committee] }),
  })
);