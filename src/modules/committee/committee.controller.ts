import type { Context } from "hono";
import { addCommittee, showActive, showPositions } from "./committee.service";


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
  const active = await showActive();
  
  
  return c.json({ active }, 201);
};


export const positions = async (c: Context) => {
  const {  number } = await c.req.json();
  const pos = await showPositions( number, c);
  return c.json({ pos }, 201);
};
