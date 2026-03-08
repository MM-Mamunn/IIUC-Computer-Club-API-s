import type { Context } from 'hono';
import { searchUsers, getUserById, getDashboardStats, getBudgetStats } from './user.service';
import { HTTPException } from 'hono/http-exception';

export const search = async (c: Context) => {
  const query = c.req.query('q') || '';
  if (query.length < 1) {
    throw new HTTPException(400, { message: 'Search query (q) is required' });
  }
  const results = await searchUsers(query);
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
  const budget = await getBudgetStats();
  return c.json({ budget }, 200);
};
