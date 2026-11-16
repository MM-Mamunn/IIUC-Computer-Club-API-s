import { Hono } from 'hono';
import { subscribe } from './newsletter.controller';
import { rateLimiter } from '../../middlewares/rate-limit.middleware';

const router = new Hono();

router.post(
  '/subscribe',
  rateLimiter({ keyPrefix: 'newsletter-ip', windowMs: 60 * 60 * 1000, max: 20, message: 'Too many subscribe attempts' }),
  subscribe,
);

export default router;
