// committee.service.ts
import type { Context } from "hono";
import { db } from "../../config/db";
import { committee, executives, positions, users } from "../../db/schema";
import { HTTPException } from "hono/http-exception";
import { and, eq, isNull } from "drizzle-orm";
// import { positions } from "./committee.controller";

export const addCommittee = async (
  number: string,
  start: string,
  gender: string,
  end: string | null, // accept null from controller
  beginningBudget: number | null, // accept number | null
  description: string | null, // accept string | null
  c: Context,
) => {
  const user = c.get("user");

  if (!number || !start || !gender) {
    throw new HTTPException(400, {
      message: "number, start and gender are required",
    });
  }

  if (isNaN(Date.parse(start))) {
    throw new HTTPException(400, {
      message: "Invalid start date format",
    });
  }

  if (end && isNaN(Date.parse(end))) {
    throw new HTTPException(400, {
      message: "Invalid end date format",
    });
  }

  if (end && new Date(end) < new Date(start)) {
    throw new HTTPException(400, {
      message: "End date cannot be before start date",
    });
  }

  // validate beginningBudget if provided (must be finite number)
  if (beginningBudget !== null && beginningBudget !== undefined) {
    if (
      typeof beginningBudget !== "number" ||
      !Number.isFinite(beginningBudget)
    ) {
      throw new HTTPException(400, {
        message: "beginningBudget must be a valid number",
      });
    }
  }

  // Check if an active committee (end IS NULL) exists for same gender
  const activeCommittee = await db
    .select()
    .from(committee)
    .where(and(eq(committee.gender, gender), isNull(committee.end)))
    .limit(1);

  if (activeCommittee.length > 0) {
    throw new HTTPException(409, {
      message: `An active committee for gender '${gender}' already exists. You must close it first.`,
    });
  }

  // Check by committee number existence
  const existing = await db
    .select()
    .from(committee)
    .where(eq(committee.number, number))
    .limit(1);

  if (existing.length > 0) {
    throw new HTTPException(409, {
      message: `Committee ${number} already exists`,
    });
  }

  // Insert new committee
  const [newCommittee] = await db
    .insert(committee)
    .values({
      number,
      start,
      gender,
      end: end ?? null,
      beginningBudget: beginningBudget ?? null,
      description: description ?? null,
    })
    .returning();

  return newCommittee;
};

export const showActive = async (c: Context) => {
  const user = c.get("user");

  const activeCommittees = await db
    .select()
    .from(committee)
    .where(isNull(committee.end));

  return activeCommittees;
};


export const showPositions = async (number: string, c: Context) => {
  const poss = await db
  .selectDistinct({ position: executives.position })
  .from(executives)
  .where(eq(executives.number, number));
  return poss;
};
