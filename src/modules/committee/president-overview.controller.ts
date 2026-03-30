import type { Context } from 'hono';
import {
  getAllCommitteesForPresident,
  getCommitteeOverview,
  getAllOverviews,
} from './president-overview.service';

/** GET /committee/president/committees — list all committees for selector */
export const presidentCommittees = async (c: Context) => {
  const committees = await getAllCommitteesForPresident();
  return c.json({ committees }, 200);
};

/** GET /committee/president/:number/overview — full committee financial overview */
export const presidentOverview = async (c: Context) => {
  const number = c.req.param('number');
  const overview = await getCommitteeOverview(number);
  return c.json({ overview }, 200);
};

/** GET /committee/president/all-overviews — ALL committees with full data in one call */
export const presidentAllOverviews = async (c: Context) => {
  const overviews = await getAllOverviews();
  return c.json({ overviews }, 200);
};
