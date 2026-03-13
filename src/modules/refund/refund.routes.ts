import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { getRolesByPriorityRange } from '../global/global.service';
import {
  listRefundsController,
  listMyRefundsController,
  getRefundController,
  submitDestinationController,
  processRefundController,
} from './refund.controller';

const router = new Hono();

// ─── Student: list my refund requests ───
router.get('/my', authMiddleware, listMyRefundsController);

// ─── Admin/treasurer: list all refund requests ───
router.get(
  '/',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  listRefundsController,
);

// ─── Get a single refund (own or staff) ───
router.get('/:id', authMiddleware, getRefundController);

// ─── Student: submit / resubmit refund destination ───
router.put('/:id/destination', authMiddleware, submitDestinationController);

// ─── Treasurer: mark as paid + upload proof ───
router.put(
  '/:id/process',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  processRefundController,
);

export default router;
