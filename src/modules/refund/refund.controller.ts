import type { Context } from 'hono';
import {
  listRefunds,
  listMyRefunds,
  getRefund,
  submitDestination,
  reviewRefund,
  processRefund,
  confirmRefund,
} from './refund.service';
import { uploadImageToCloudinary } from '../../utils/uploadImage';

// ─── List all refunds (admin/treasurer) ───
export const listRefundsController = async (c: Context) => {
  const eventId = c.req.query('eventId') ? Number(c.req.query('eventId')) : undefined;
  const status = c.req.query('status') || undefined;
  const refunds = await listRefunds(eventId, status);
  return c.json({ refunds });
};

// ─── List my refunds (student) ───
export const listMyRefundsController = async (c: Context) => {
  const user = c.get('user');
  const refunds = await listMyRefunds(user.id);
  return c.json({ refunds });
};

// ─── Get single refund ───
export const getRefundController = async (c: Context) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const refund = await getRefund(id);

  // Students can only see their own; staff can see any
  if (refund.userId !== user.id && !user.role) {
    return c.json({ message: 'Forbidden' }, 403);
  }

  return c.json({ refund });
};

// ─── Student submits refund destination ───
export const submitDestinationController = async (c: Context) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  const refund = await submitDestination(id, user.id, {
    refundMethod: body.refundMethod,
    refundAccountNumber: body.refundAccountNumber,
    refundAccountOwnerName: body.refundAccountOwnerName,
    isDifferentFromPayer: !!body.isDifferentFromPayer,
    declarationAccepted: !!body.declarationAccepted,
  });

  return c.json({ refund });
};

// ─── Admin reviews (approve / reject) ───
export const reviewRefundController = async (c: Context) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const body = await c.req.json();

  if (!['approve', 'reject'].includes(body.action)) {
    return c.json({ message: 'Action must be "approve" or "reject"' }, 400);
  }

  const refund = await reviewRefund(id, user.id, body.action, body.notes, body.rejectionReason);
  return c.json({ refund });
};

// ─── Treasurer marks as paid (with optional proof upload) ───
export const processRefundController = async (c: Context) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));

  const contentType = c.req.header('content-type') ?? '';
  let refundTransactionRef: string | undefined;
  let proofUrl: string | undefined;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    refundTransactionRef = formData.get('refundTransactionRef') as string | undefined;
    const proofFile = formData.get('proof') as File | null;
    if (proofFile && proofFile.size > 0) {
      proofUrl = await uploadImageToCloudinary(proofFile);
    }
  } else {
    const body = await c.req.json();
    refundTransactionRef = body.refundTransactionRef;
    proofUrl = body.proofUrl;
  }

  const refund = await processRefund(id, user.id, { refundTransactionRef, proofUrl });
  return c.json({ refund });
};

// ─── Student confirms receipt ───
export const confirmRefundController = async (c: Context) => {
  const user = c.get('user');
  const id = Number(c.req.param('id'));
  const refund = await confirmRefund(id, user.id);
  return c.json({ refund });
};
