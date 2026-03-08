import { Hono } from 'hono';
import { cors } from 'hono/cors';
import authRoutes from './modules/auth/auth.routes';
import authorizationRoutes from './modules/authorization/authorization.routes';
import userRoutes from './modules/user/user.routes';
import committeeRoutes from './modules/committee/committee.routes';
import eventRoutes from './modules/event/event.routes';
import general from './modules/general/general.routes';

const app = new Hono();

const ALLOWED_ORIGINS = [
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
 * API Routes
 */
app.route('/api', general);
app.route('/api/auth', authRoutes);
app.route('/api/users', userRoutes);
app.route('/api/authorization', authorizationRoutes);
app.route('/api/committee', committeeRoutes);
app.route('/api/events', eventRoutes);

export default app;
