import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole, requireAdminOrEventManager } from '../../middlewares/role.middleware';
import { getRolesByPriorityRange } from '../global/global.service';
import {
  create,
  list,
  getOne,
  getOneStaff,
  staffBudgets,
  update,
  remove,
  register,
  unregister,
  registrations,
  registrationStatsController,
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
  managedUpdateRegistrationResponsesController,
  addExpenseController,
  updateExpenseController,
  deleteExpenseController,
  listExpensesController,
  submitClaimController,
  updateClaimController,
  deleteClaimController,
  reviewClaimController,
  markClaimPaidController,
  listClaimsController,
  myClaimsController,
  financialsController,
  generateVoucherController,
  regenerateVoucherController,
  getVoucherController,
  updateRegistrationResponsesController,
  toggleFinancesLockController,
  getFixPaymentDetailsController,
  fixPaymentController,
  slugAvailability,
} from './event.controller';
import { initiateSslcommerzPayment, handleSslcommerzIpn } from './sslcommerz.service';
import { resolveFrontendUrl } from '../../config/origins';
import { rateLimiter } from '../../middlewares/rate-limit.middleware';
import type { Context } from 'hono';
import { eq } from 'drizzle-orm';
import { db } from '../../config/db';
import { events } from '../../db/event.schema';

const router = new Hono();

// ─── Public / any authenticated user ───
router.get('/', list);

// ─── Registration stats (must be before /:id to avoid route conflict) ───
router.get(
  '/registration-stats',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 4)),
  registrationStatsController,
);

// Live check for the slug field in the event form (before /:id)
router.get('/slug-available', authMiddleware, slugAvailability);

// Staff views with budget figures; private, never CDN-cached (before /:id)
router.get('/staff/budgets', authMiddleware, staffBudgets);

router.get('/:id', getOne);
router.get(
  '/:id/staff',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  getOneStaff,
);

// ─── Guest event registration (no auth — creates account + registers) ───
// Creates an account, so limit it like /auth/register
router.post(
  '/:id/guest-register',
  rateLimiter({ keyPrefix: 'guest-register-ip', windowMs: 60 * 60 * 1000, max: 60 }),
  guestRegister,
);

// ─── Fix payment (public — uses token from rejection email) ───
router.get('/:id/fix-payment', getFixPaymentDetailsController);
router.post('/:id/fix-payment', fixPaymentController);

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
  const id = parseInt(c.req.param('id') ?? '');
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

// SSLCommerz posts the browser back here; send it to our own site only.
// Straight to the slug URL: /events/<id> redirects there and drops the
// ?payment= the page needs for its result message.
const paymentRedirect = (outcome: 'success' | 'failed' | 'cancelled') => async (c: Context) => {
  const body = await c.req.parseBody();
  const frontendBaseUrl = resolveFrontendUrl(body.value_c);
  const eventId = String(body.value_a ?? '').replace(/[^0-9]/g, '');
  let path = eventId;
  if (eventId) {
    const [row] = await db
      .select({ slug: events.slug })
      .from(events)
      .where(eq(events.id, Number(eventId)))
      .catch(() => []);
    if (row?.slug) path = encodeURIComponent(row.slug);
  }
  return c.redirect(`${frontendBaseUrl}/events/${path}?payment=${outcome}`);
};

router.post('/payment/sslcommerz/success', paymentRedirect('success'));
router.post('/payment/sslcommerz/fail', paymentRedirect('failed'));
router.post('/payment/sslcommerz/cancel', paymentRedirect('cancelled'));

// ─── Executive-only (priority ≤ 4) ───
router.post('/', authMiddleware, requireRole(await getRolesByPriorityRange(1, 4)), create);

router.put('/:id', authMiddleware, requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)), update);

router.delete('/:id', authMiddleware, requireRole(await getRolesByPriorityRange(1, 2)), remove);

router.get(
  '/:id/registrations',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  registrations,
);

// ─── Payment verification (executive only, priority ≤ 4) ───
router.put(
  '/:id/verify-payment',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  verifyPaymentController,
);

// ─── Update registration responses (executive only, priority ≤ 4) ───
router.put(
  '/:id/registrations/:userId/responses',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  updateRegistrationResponsesController,
);

// ─── Duty management (priority ≤ 3) ───
router.post(
  '/:id/duties',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 3)),
  assignDutyController,
);

router.delete(
  '/:id/duties',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 3)),
  removeDutyController,
);

router.get('/:id/duties', authMiddleware, duties);

// ─── Event Manager delegation ───
router.get('/me/managed-events', authMiddleware, myManagedEventsController);
router.get('/:id/managed-registrations', authMiddleware, managedEventRegistrations);
router.put(
  '/:id/managed-registrations/:userId/responses',
  authMiddleware,
  managedUpdateRegistrationResponsesController,
);

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
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  managersController,
);

// ─── Financial: Expenses ───
router.get(
  '/:id/expenses',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
  listExpensesController,
);
router.post(
  '/:id/expenses',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  addExpenseController,
);
router.put(
  '/:id/expenses/:expenseId',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  updateExpenseController,
);
router.delete(
  '/:id/expenses/:expenseId',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 4)),
  deleteExpenseController,
);

// ─── Financial: Expense Claims ───
router.get('/me/claims', authMiddleware, myClaimsController);
router.post('/:id/claims', authMiddleware, submitClaimController);
router.put('/:id/claims/:claimId', authMiddleware, updateClaimController);
router.delete(
  '/:id/claims/:claimId',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 3)),
  deleteClaimController,
);
router.get(
  '/:id/claims',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
  listClaimsController,
);
router.put(
  '/:id/claims/:claimId/review',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
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
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
  financialsController,
);
router.post(
  '/:id/voucher',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
  generateVoucherController,
);
router.put(
  '/:id/voucher',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
  regenerateVoucherController,
);
router.get(
  '/:id/voucher',
  authMiddleware,
  requireAdminOrEventManager(await getRolesByPriorityRange(1, 5)),
  getVoucherController,
);

// ─── Financial: Lock/Unlock (priority ≤ 2: president, VP, treasurer) ───
router.put(
  '/:id/finances-lock',
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1, 2)),
  toggleFinancesLockController,
);

export default router;
