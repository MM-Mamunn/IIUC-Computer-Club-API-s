import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { search, getUser, stats, budgetStats } from './user.controller';
import { getRolesByPriorityRange } from '../global/global.service';

const router = new Hono();

router.get(
  '/teacher-dashboard',
  authMiddleware,
  requireRole([
    'president',
    'treasurer',
    'vice president',
    'general secretary',
    'asst general secretary',
  ]),
  (c) => c.json({ message: 'Welcome boss' }),
);

router.get('/test', (c) => c.json({ message: 'Working test' }));

// Search users
router.get('/search', authMiddleware, search);

// Dashboard stats (must come before /:id)
router.get(
  '/stats/dashboard',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 6)),
  stats,
);

// Budget stats (president/treasurer only, priority ≤ 5)
router.get(
  '/stats/budget',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  budgetStats,
);

// Get user by ID (must be last — catches all /:id patterns)
router.get('/:id', authMiddleware, getUser);

export default router;
