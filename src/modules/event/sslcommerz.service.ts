import { db } from '../../config/db';
import { events, eventRegistrations } from '../../db/event.schema';
import { users } from '../../db/schema';
import { eq, and } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { setSslcommerzTranId, verifySslcommerzPayment } from './event.service';
import { invalidate } from '../../utils/cache';
import crypto from 'crypto';

const SSLCOMMERZ_STORE_ID = process.env.SSLCOMMERZ_STORE_ID ?? '';
const SSLCOMMERZ_STORE_PASSWORD = process.env.SSLCOMMERZ_STORE_PASSWORD ?? '';
const SSLCOMMERZ_IS_SANDBOX = process.env.SSLCOMMERZ_IS_SANDBOX !== 'false';

const BASE_URL = SSLCOMMERZ_IS_SANDBOX
  ? 'https://sandbox.sslcommerz.com'
  : 'https://securepay.sslcommerz.com';

const VALIDATION_URL = SSLCOMMERZ_IS_SANDBOX
  ? 'https://sandbox.sslcommerz.com/validator/api/validationserverAPI.php'
  : 'https://securepay.sslcommerz.com/validator/api/validationserverAPI.php';

/**
 * Initiate an SSLCommerz payment session for an event registration.
 */
export const initiateSslcommerzPayment = async (
  eventId: number,
  userId: string,
  frontendBaseUrl: string,
) => {
  if (!SSLCOMMERZ_STORE_ID || !SSLCOMMERZ_STORE_PASSWORD) {
    throw new HTTPException(500, { message: 'Payment service is currently unavailable. Please try again later.' });
  }

  const [event] = await db.select().from(events).where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  if (!event.isPaid) throw new HTTPException(400, { message: 'This is a free event' });
  if (!event.sslcommerzEnabled)
    throw new HTTPException(400, { message: 'SSLCommerz is not enabled for this event' });

  // Get or create registration
  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.userId, userId)));
  if (!reg) throw new HTTPException(404, { message: 'Please register for the event first' });
  if (reg.paymentStatus === 'verified')
    throw new HTTPException(400, { message: 'Payment already verified' });

  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  // Generate unique transaction ID
  const tranId = `IIUC_${eventId}_${userId}_${crypto.randomBytes(6).toString('hex')}`;

  // Store tran_id in registration
  await setSslcommerzTranId(eventId, userId, tranId);

  const backendBaseUrl = process.env.BACKEND_BASE_URL || 'http://localhost:3000';

  const params = new URLSearchParams({
    store_id: SSLCOMMERZ_STORE_ID,
    store_passwd: SSLCOMMERZ_STORE_PASSWORD,
    total_amount: String(event.fee ?? 0),
    currency: 'BDT',
    tran_id: tranId,
    success_url: `${backendBaseUrl}/api/events/payment/sslcommerz/success`,
    fail_url: `${backendBaseUrl}/api/events/payment/sslcommerz/fail`,
    cancel_url: `${backendBaseUrl}/api/events/payment/sslcommerz/cancel`,
    ipn_url: `${backendBaseUrl}/api/events/payment/sslcommerz/ipn`,
    shipping_method: 'NO',
    product_name: event.title,
    product_category: 'Event Registration',
    product_profile: 'non-physical-goods',
    cus_name: user.name,
    cus_email: user.email,
    cus_phone: 'N/A',
    cus_add1: 'N/A',
    cus_city: 'Chittagong',
    cus_country: 'Bangladesh',
    // Value fields for redirect
    value_a: String(eventId),
    value_b: userId,
    value_c: frontendBaseUrl,
  });

  const response = await fetch(`${BASE_URL}/gwprocess/v4/api.php`, {
    method: 'POST',
    body: params,
  });

  const result = await response.json();

  if (result.status !== 'SUCCESS') {
    throw new HTTPException(500, {
      message: 'Failed to initiate payment. Please try again later.',
    });
  }

  return { gatewayUrl: result.GatewayPageURL, tranId };
};

/** Fields we use from SSLCommerz's validation API response */
export interface SslcommerzValidation {
  status?: string;
  tran_id?: string;
  val_id?: string;
  amount?: string;
  currency?: string;
  currency_type?: string;
  currency_amount?: string;
}

/**
 * Ask SSLCommerz whether `valId` is a real, completed payment. Returns the
 * validation record, or null if it isn't valid or the call failed.
 */
export const validateSslcommerzPayment = async (
  valId: string,
): Promise<SslcommerzValidation | null> => {
  if (!SSLCOMMERZ_STORE_ID || !SSLCOMMERZ_STORE_PASSWORD) return null;

  const url = `${VALIDATION_URL}?val_id=${encodeURIComponent(valId)}&store_id=${encodeURIComponent(SSLCOMMERZ_STORE_ID)}&store_passwd=${encodeURIComponent(SSLCOMMERZ_STORE_PASSWORD)}&format=json`;

  try {
    const response = await fetch(url);
    const result = (await response.json()) as SslcommerzValidation;
    return result.status === 'VALID' || result.status === 'VALIDATED' ? result : null;
  } catch {
    return null;
  }
};

/**
 * Why a validated payment doesn't pay for this registration, or null if it does.
 * A real payment for one transaction (or a cheaper event) must not be replayed
 * against another registration.
 */
export const paymentMismatch = (
  validation: SslcommerzValidation,
  tranId: string,
  valId: string,
  fee: number,
): string | null => {
  if (validation.tran_id !== tranId) return 'transaction id does not match';
  if (validation.val_id && validation.val_id !== valId) return 'validation id does not match';
  const currency = validation.currency_type || validation.currency;
  if (currency !== 'BDT') return `unexpected currency ${currency}`;
  const paid = Number(validation.currency_amount ?? validation.amount);
  if (!Number.isFinite(paid) || paid + 0.01 < fee) return `paid ${paid} but the fee is ${fee}`;
  return null;
};

/**
 * Handle SSLCommerz IPN (Instant Payment Notification).
 */
export const handleSslcommerzIpn = async (body: Record<string, string>) => {
  const { tran_id, val_id, status } = body;

  if (!tran_id || !val_id) {
    throw new HTTPException(400, { message: 'Invalid IPN data' });
  }

  const [reg] = await db
    .select()
    .from(eventRegistrations)
    .where(eq(eventRegistrations.sslcommerzTranId, tran_id));

  if (!reg) {
    throw new HTTPException(404, { message: 'Registration not found for this transaction' });
  }

  // Nothing in an unauthenticated notification may undo a verified payment
  if (reg.paymentStatus === 'verified') {
    return { success: true };
  }

  if (status !== 'VALID') {
    await db
      .update(eventRegistrations)
      .set({ paymentStatus: 'failed' })
      .where(
        and(eq(eventRegistrations.eventId, reg.eventId), eq(eventRegistrations.userId, reg.userId)),
      );

    invalidate('events:');
    invalidate('dashboard:');
    invalidate('president:');
    return { success: false };
  }

  // Validate with SSLCommerz server, then check the payment is for this registration
  const validation = await validateSslcommerzPayment(val_id);
  if (!validation) {
    throw new HTTPException(400, { message: 'Payment validation failed' });
  }

  const [event] = await db.select({ fee: events.fee }).from(events).where(eq(events.id, reg.eventId));
  const mismatch = paymentMismatch(validation, tran_id, val_id, event?.fee ?? 0);
  if (mismatch) {
    console.error(`[sslcommerz] Rejected IPN for ${tran_id}: ${mismatch}`);
    throw new HTTPException(400, { message: 'Payment validation failed' });
  }

  // One payment can only ever verify one registration
  const [usedBy] = await db
    .select({ eventId: eventRegistrations.eventId, userId: eventRegistrations.userId })
    .from(eventRegistrations)
    .where(eq(eventRegistrations.sslcommerzValId, val_id));
  if (usedBy && (usedBy.eventId !== reg.eventId || usedBy.userId !== reg.userId)) {
    console.error(`[sslcommerz] Rejected IPN for ${tran_id}: val_id already used`);
    throw new HTTPException(400, { message: 'Payment validation failed' });
  }

  await verifySslcommerzPayment(tran_id, val_id);
  return { success: true };
};
