import { Hono } from 'hono';
import {
  activeCommittees,
  newCommittee,
  positions,
  allCommittees,
  close,
  members,
} from './committee.controller';
import {
  presidentCommittees,
  presidentOverview,
  presidentAllOverviews,
} from './president-overview.controller';
import { requireRole } from '../../middlewares/role.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { getRolesByPriorityRange } from '../global/global.service';

const router = new Hono();

router.post('/new', authMiddleware, requireRole(await getRolesByPriorityRange(1, 1)), newCommittee);

router.get('/active', activeCommittees);

router.get('/all', allCommittees);

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
