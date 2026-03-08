import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { getRolesByPriorityRange } from '../global/global.service';
import {
  create,
  list,
  getOne,
  update,
  remove,
  register,
  unregister,
  registrations,
  assignDutyController,
  removeDutyController,
  duties,
  myDuties,
  myRegistrations,
  submitPaymentController,
  verifyPaymentController,
  saveDraft,
  getDraft,
  guestRegister,
  addManagerController,
  removeManagerController,
  managersController,
  myManagedEventsController,
  managedEventRegistrations,
  addExpenseController,
  updateExpenseController,
  deleteExpenseController,
  listExpensesController,
  submitClaimController,
  reviewClaimController,
  markClaimPaidController,
  listClaimsController,
  myClaimsController,
  financialsController,
  generateVoucherController,
  regenerateVoucherController,
  getVoucherController,
} from './event.controller';
import { initiateSslcommerzPayment, handleSslcommerzIpn } from './sslcommerz.service';
import type { Context } from 'hono';

const router = new Hono();

// ─── Public / any authenticated user ───
router.get('/', list);
router.get('/:id', getOne);

// ─── Guest event registration (no auth — creates account + registers) ───
router.post('/:id/guest-register', guestRegister);

// ─── Authenticated-only ───
router.post('/:id/register', authMiddleware, register);
router.delete('/:id/unregister', authMiddleware, unregister);
router.get('/me/registrations', authMiddleware, myRegistrations);
router.get('/me/duties', authMiddleware, myDuties);

// ─── Payment routes (authenticated) ───
router.post('/:id/payment', authMiddleware, submitPaymentController);
router.post('/:id/draft', authMiddleware, saveDraft);
router.get('/:id/draft', authMiddleware, getDraft);

// ─── SSLCommerz payment initiation (authenticated) ───
router.post('/:id/pay-sslcommerz', authMiddleware, async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const { frontendBaseUrl } = await c.req.json().catch(() => ({ frontendBaseUrl: '' }));
  const result = await initiateSslcommerzPayment(id, user.id, frontendBaseUrl || '');
  return c.json(result, 200);
});

// ─── SSLCommerz callbacks (public - called by SSLCommerz servers) ───
router.post('/payment/sslcommerz/ipn', async (c: Context) => {
  const body = await c.req.parseBody();
  await handleSslcommerzIpn(body as Record<string, string>);
  return c.text('OK', 200);
});

router.post('/payment/sslcommerz/success', async (c: Context) => {
  const body = await c.req.parseBody();
  const frontendBaseUrl = (body.value_c as string) || '';
  const eventId = body.value_a as string;
  // Redirect user back to the event page
  const redirectUrl = frontendBaseUrl
    ? `${frontendBaseUrl}/events/${eventId}?payment=success`
    : `/events/${eventId}?payment=success`;
  return c.redirect(redirectUrl);
});

router.post('/payment/sslcommerz/fail', async (c: Context) => {
  const body = await c.req.parseBody();
  const frontendBaseUrl = (body.value_c as string) || '';
  const eventId = body.value_a as string;
  const redirectUrl = frontendBaseUrl
    ? `${frontendBaseUrl}/events/${eventId}?payment=failed`
    : `/events/${eventId}?payment=failed`;
  return c.redirect(redirectUrl);
});

router.post('/payment/sslcommerz/cancel', async (c: Context) => {
  const body = await c.req.parseBody();
  const frontendBaseUrl = (body.value_c as string) || '';
  const eventId = body.value_a as string;
  const redirectUrl = frontendBaseUrl
    ? `${frontendBaseUrl}/events/${eventId}?payment=cancelled`
    : `/events/${eventId}?payment=cancelled`;
  return c.redirect(redirectUrl);
});

// ─── Executive-only (priority ≤ 4) ───
router.post('/', authMiddleware, requireRole(await getRolesByPriorityRange(1, 4)), create);

router.put('/:id', authMiddleware, requireRole(await getRolesByPriorityRange(1, 4)), update);

router.delete('/:id', authMiddleware, requireRole(await getRolesByPriorityRange(1, 2)), remove);

router.get(
  '/:id/registrations',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  registrations,
);

// ─── Payment verification (executive only, priority ≤ 4) ───
router.put(
  '/:id/verify-payment',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  verifyPaymentController,
);

// ─── Duty management (priority ≤ 3) ───
router.post(
  '/:id/duties',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 3)),
  assignDutyController,
);

router.delete(
  '/:id/duties',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 3)),
  removeDutyController,
);

router.get('/:id/duties', authMiddleware, duties);

// ─── Event Manager delegation ───
router.get('/me/managed-events', authMiddleware, myManagedEventsController);
router.get('/:id/managed-registrations', authMiddleware, managedEventRegistrations);

router.post(
  '/:id/managers',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  addManagerController,
);
router.delete(
  '/:id/managers',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  removeManagerController,
);
router.get(
  '/:id/managers',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  managersController,
);

// ─── Financial: Expenses ───
router.get(
  '/:id/expenses',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  listExpensesController,
);
router.post(
  '/:id/expenses',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  addExpenseController,
);
router.put(
  '/:id/expenses/:expenseId',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  updateExpenseController,
);
router.delete(
  '/:id/expenses/:expenseId',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  deleteExpenseController,
);

// ─── Financial: Expense Claims ───
router.get('/me/claims', authMiddleware, myClaimsController);
router.post('/:id/claims', authMiddleware, submitClaimController);
router.get(
  '/:id/claims',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  listClaimsController,
);
router.put(
  '/:id/claims/:claimId/review',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  reviewClaimController,
);
router.put(
  '/:id/claims/:claimId/pay',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 2)),
  markClaimPaidController,
);

// ─── Financial: Financials & Voucher ───
router.get(
  '/:id/financials',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  financialsController,
);
router.post(
  '/:id/voucher',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  generateVoucherController,
);
router.put(
  '/:id/voucher',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  regenerateVoucherController,
);
router.get(
  '/:id/voucher',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 5)),
  getVoucherController,
);

export default router;
