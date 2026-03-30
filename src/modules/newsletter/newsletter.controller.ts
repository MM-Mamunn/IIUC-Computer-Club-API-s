import type { Context } from 'hono';
import { subscribeNewsletter } from './newsletter.service';

export const subscribe = async (c: Context) => {
  const body = await c.req.json().catch(() => ({}));
  const email = typeof body?.email === 'string' ? body.email : '';
  const result = await subscribeNewsletter(email);
  return c.json(result, 200);
};
