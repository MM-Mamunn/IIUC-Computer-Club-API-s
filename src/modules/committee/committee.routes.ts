import { Hono } from 'hono';
import {
  activeCommittees,
  newCommittee,
  positions,
  allCommittees,
  close,
  members,
} from './committee.controller';
import { requireRole } from '../../middlewares/role.middleware';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { getRolesByPriorityRange } from '../global/global.service';

const router = new Hono();

router.post('/new', authMiddleware, requireRole(await getRolesByPriorityRange(1, 1)), newCommittee);

router.get('/active', activeCommittees);

router.get('/all', allCommittees);

router.get('/:number/members', members);

router.put(
  '/:number/close',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 1)),
  close,
);

router.post('/positions', positions);

export default router;
