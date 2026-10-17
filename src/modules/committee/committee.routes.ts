import { Hono } from 'hono';
import {
  activeCommittees,
  newCommittee,
  positions,
  allCommittees,
  close,
  members,
  createSubmission,
  getSubmission,
  listSubmissions,
} from './committee.controller';
import {
  presidentCommittees,
  presidentOverview,
  presidentAllOverviews,
} from './president-overview.controller';
import { requireRole } from '../../middlewares/role.middleware';
import { authMiddleware, optionalAuthMiddleware } from '../../middlewares/auth.middleware';
import { rateLimiter } from '../../middlewares/rate-limit.middleware';
import { getRolesByPriorityRange } from '../global/global.service';

const router = new Hono();

router.post('/new', authMiddleware, requireRole(await getRolesByPriorityRange(1, 1)), newCommittee);

router.get('/active', activeCommittees);

router.get('/all', allCommittees);

// ─── Public/Authenticated Committee Member Applications ───
router.post(
  '/submission',
  rateLimiter({ windowMs: 15 * 60 * 1000, max: 30, keyPrefix: 'committee-sub' }),
  optionalAuthMiddleware,
  createSubmission,
);
router.get('/submission/:matrixId', authMiddleware, getSubmission);
router.get('/submissions', authMiddleware, listSubmissions);



// ─── President-only: Committee overview with full financial records ───
router.get(
  '/president/committees',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 1)),
  presidentCommittees,
);

router.get(
  '/president/all-overviews',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 1)),
  presidentAllOverviews,
);

router.get(
  '/president/:number/overview',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 1)),
  presidentOverview,
);

router.get('/:number/members', members);

router.put(
  '/:number/close',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 1)),
  close,
);

router.post('/positions', positions);

export default router;