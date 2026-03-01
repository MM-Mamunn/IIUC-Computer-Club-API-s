import type { Context } from "hono";
import { addCommittee, showActive } from "./committee.service";

// committee.controller.ts
type CommitteeBody = {
  number: string;
  start: string;
  end?: string | null;
  gender: string;
  beginningBudget?: number | null;
  description?: string | null;
};

export const newCommittee = async (c: Context) => {
  const body = (await c.req.json()) as CommitteeBody;

  const committee = await addCommittee(
    body.number,
    body.start,
    body.gender,
    body.end ?? null,
    body.beginningBudget ?? null,
    body.description ?? null,
    c,
  );

  return c.json({ committee }, 201);
};
export const activeCommittees = async (c: Context) => {
  const active = await showActive(c);

  return c.json({ active }, 201);
};
