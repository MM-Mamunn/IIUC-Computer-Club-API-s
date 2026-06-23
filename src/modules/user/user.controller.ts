import type { Context } from 'hono';
import { searchUsers, getUserDirectory, getUserById, getDashboardStats, getBudgetStats } from './user.service';
import { HTTPException } from 'hono/http-exception';

export const directory = async (c: Context) => {
  const page = parseInt(c.req.query('page') || '1', 10);
  const limit = parseInt(c.req.query('limit') || '10', 10);
  const search = c.req.query('search') || undefined;
  const department = c.req.query('department') || undefined;
  const committee = c.req.query('committee') || undefined;

  const result = await getUserDirectory({ page, limit, search, department, committee });
  return c.json(result, 200);
};

export const search = async (c: Context) => {
  const query = c.req.query('q') || '';
  const committeeNumber = c.req.query('committee') || undefined;
  const filterByRole = c.req.query('filterByRole') === 'true';
  const executivesOnly = c.req.query('executivesOnly') === 'true';
  if (query.length < 1) {
    throw new HTTPException(400, { message: 'Search query (q) is required' });
  }
  // When filterByRole is true, pass the caller's role to filter out equal/higher-priority users
  const callerRole = filterByRole ? (c.get('user')?.role as string | undefined) : undefined;
  const results = await searchUsers(query, committeeNumber, callerRole, executivesOnly);
  return c.json({ users: results }, 200);
};

export const getUser = async (c: Context) => {
  const id = c.req.param('id');
  const user = await getUserById(id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });
  return c.json({ user }, 200);
};

export const stats = async (c: Context) => {
  const dashboardStats = await getDashboardStats();
  return c.json({ stats: dashboardStats }, 200);
};

export const budgetStats = async (c: Context) => {
  const committeeNumber = c.req.query('committee') || undefined;
  const budget = await getBudgetStats(committeeNumber);
  return c.json({ budget }, 200);
};
