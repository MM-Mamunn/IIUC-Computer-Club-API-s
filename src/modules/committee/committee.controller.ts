import type { Context } from "hono";
import { addCommittee, allExecutives, showActive, showPositions } from "./committee.service";


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
export const allExec = async (c: Context) => {
  const {  number } =  c.req.param();
  const page = Number(c.req.param("page")) || 1;
const limit = Number(c.req.param("limit")) || 10;
console.log(page, limit);

  const all = await allExecutives( number,page, limit, c);
  return c.json(all, 200);
};
