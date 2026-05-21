import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { HTTPException } from 'hono/http-exception';
import authRoutes from './modules/auth/auth.routes';
import authorizationRoutes from './modules/authorization/authorization.routes';
import userRoutes from './modules/user/user.routes';
import committeeRoutes from './modules/committee/committee.routes';
import eventRoutes from './modules/event/event.routes';
import refundRoutes from './modules/refund/refund.routes';
import newsletterRoutes from './modules/newsletter/newsletter.routes';
import general from './modules/general/general.routes';
import { invalidate } from './utils/cache';

const app = new Hono();

const ALLOWED_ORIGINS = [
  'https://iiuccomputerclub.vercel.app',
  'https://www.iiuccomputerclub.vercel.app',
  'https://iiuc-computer-club-one.vercel.app',
  'https://www.iiuc-computer-club-one.vercel.app',
  'http://localhost:3000',
];

app.use(
  '/*',
  cors({
    origin: (origin) => (ALLOWED_ORIGINS.includes(origin) ? origin : ''),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  }),
);

/**
 * Basic test route
 */
app.get('/', (c) => {
  return c.json({
    success: true,
    message: 'API is running 🚀',
    timestamp: new Date().toISOString(),
  });
});

app.get('/api', (c) => {
  return c.json({
    success: true,
    message: 'API is running 🚀',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Cache-busting middleware:
 * After any successful POST/PUT/PATCH/DELETE, invalidate related caches.
 * Must be registered BEFORE routes so middleware wraps them.
 */
app.use('/api/events/*', async (c, next) => {
  await next();
  const method = c.req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && c.res.status < 400) {
    invalidate('events:');
    invalidate('dashboard:');
    invalidate('president:');
  }
});

app.use('/api/authorization/*', async (c, next) => {
  await next();
  const method = c.req.method;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method) && c.res.status < 400) {
    invalidate('committee:members:');
    invalidate('dashboard:');
    invalidate('president:');
  }
});

/**
 * API Routes
 */
app.route('/api', general);
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/authorization', authorizationRoutes);
app.route('/api/committee', committeeRoutes);
app.route('/api/events', eventRoutes);
app.route('/api/refunds', refundRoutes);
app.route('/api/newsletter', newsletterRoutes);

/**
 * Global error handler — returns clean, user-friendly messages.
 * Never exposes internal stack traces or sensitive details.
 */
app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ message: err.message }, err.status);
  }

  // Log the real error server-side for debugging
  console.error('[Unhandled Error]', err);

  // Return a generic message to the client
  return c.json({ message: 'Something went wrong. Please try again later.' }, 500);
});

export default app;
