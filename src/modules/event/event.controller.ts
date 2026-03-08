import type { Context } from 'hono';
import {
  createEvent,
  listEvents,
  getEventById,
  updateEvent,
  deleteEvent,
  registerForEvent,
  unregisterFromEvent,
  getEventRegistrations,
  assignDuty,
  removeDuty,
  getEventDuties,
  getMyDuties,
  getMyRegistrations,
  submitPayment,
  verifyPayment,
  saveDraftData,
  getDraftData,
  guestRegisterForEvent,
  addEventManager,
  removeEventManager,
  getEventManagers,
  getMyManagedEvents,
  isEventManager,
  addEventExpense,
  updateEventExpense,
  deleteEventExpense,
  getEventExpenses,
  submitExpenseClaim,
  reviewExpenseClaim,
  markClaimPaid,
  getEventClaims,
  getMyClaims,
  getEventFinancials,
  generateVoucher,
  regenerateVoucher,
  getEventVoucher,
} from './event.service';
import { uploadImageToCloudinary } from '../../utils/uploadImage';

export const create = async (c: Context) => {
  const contentType = c.req.header('content-type') ?? '';

  let data: Record<string, unknown>;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    data = {
      title: formData.get('title') as string,
      description: (formData.get('description') as string) || undefined,
      committeeNumber: formData.get('committeeNumber') as string,
      eventDate: formData.get('eventDate') as string,
      registrationDeadline: (formData.get('registrationDeadline') as string) || undefined,
      venue: (formData.get('venue') as string) || undefined,
      isPaid: formData.get('isPaid') === 'true',
      fee: formData.get('fee') ? Number(formData.get('fee')) : 0,
      maxParticipants: formData.get('maxParticipants')
        ? Number(formData.get('maxParticipants'))
        : undefined,
      sslcommerzEnabled: formData.get('sslcommerzEnabled') === 'true',
      estimatedBudget: formData.get('estimatedBudget')
        ? Number(formData.get('estimatedBudget'))
        : 0,
    };

    // Parse paymentNumbers JSON
    const pnRaw = formData.get('paymentNumbers') as string;
    if (pnRaw) {
      try {
        data.paymentNumbers = JSON.parse(pnRaw);
      } catch {
        /* ignore parse error */
      }
    }

    // Parse customFields JSON
    const cfRaw = formData.get('customFields') as string;
    if (cfRaw) {
      try {
        data.customFields = JSON.parse(cfRaw);
      } catch {
        /* ignore parse error */
      }
    }

    // Handle banner upload
    const bannerFile = formData.get('banner') as File | null;
    if (bannerFile && bannerFile.size > 0) {
      data.bannerImage = await uploadImageToCloudinary(bannerFile);
    }
  } else {
    data = await c.req.json();
  }

  const event = await createEvent(data as any, c);
  return c.json({ event }, 201);
};

export const list = async (c: Context) => {
  const committeeNumber = c.req.query('committee');
  const status = c.req.query('status');
  const eventsList = await listEvents(committeeNumber, status);
  return c.json({ events: eventsList }, 200);
};

export const getOne = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const event = await getEventById(id);
  return c.json({ event }, 200);
};

export const update = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);

  const contentType = c.req.header('content-type') ?? '';
  let data: Record<string, unknown>;

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    data = {};
    for (const [key, value] of formData.entries()) {
      if (key === 'banner') continue; // handle separately
      if (key === 'paymentNumbers') {
        try {
          data.paymentNumbers = JSON.parse(value as string);
        } catch {
          /* skip */
        }
        continue;
      }
      if (key === 'customFields') {
        try {
          data.customFields = JSON.parse(value as string);
        } catch {
          /* skip */
        }
        continue;
      }
      if (key === 'isPaid' || key === 'sslcommerzEnabled') {
        data[key] = value === 'true';
        continue;
      }
      if (key === 'fee' || key === 'maxParticipants' || key === 'estimatedBudget') {
        data[key] = value ? Number(value) : undefined;
        continue;
      }
      data[key] = value || undefined;
    }

    const bannerFile = formData.get('banner') as File | null;
    if (bannerFile && bannerFile.size > 0) {
      data.bannerImage = await uploadImageToCloudinary(bannerFile);
    }
  } else {
    data = await c.req.json();
  }

  const event = await updateEvent(id, data);
  return c.json({ event }, 200);
};

export const remove = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const result = await deleteEvent(id);
  return c.json(result, 200);
};

export const register = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const body = await c.req.json().catch(() => ({}));
  const reg = await registerForEvent(
    id,
    user.id,
    body.paymentMethod,
    body.transactionId,
    body.customFieldResponses,
  );
  return c.json({ registration: reg }, 201);
};

export const unregister = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const result = await unregisterFromEvent(id, user.id);
  return c.json(result, 200);
};

export const registrations = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const regs = await getEventRegistrations(id);
  return c.json({ registrations: regs }, 200);
};

export const submitPaymentController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const { paymentMethod, transactionId } = await c.req.json();
  const result = await submitPayment(id, user.id, paymentMethod, transactionId);
  return c.json({ registration: result }, 200);
};

export const verifyPaymentController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const { userId, verified } = await c.req.json();
  if (!userId) return c.json({ message: 'userId is required' }, 400);
  const result = await verifyPayment(id, userId, verified !== false);
  return c.json({ registration: result }, 200);
};

export const saveDraft = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const { draftData } = await c.req.json();
  const result = await saveDraftData(id, user.id, draftData);
  return c.json({ draft: result }, 200);
};

export const getDraft = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const draftData = await getDraftData(id, user.id);
  return c.json({ draftData }, 200);
};

export const assignDutyController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const { userId, duty, description } = await c.req.json();
  if (!userId || !duty) return c.json({ message: 'userId and duty are required' }, 400);
  const dutyRecord = await assignDuty(id, userId, duty, description ?? null, c);
  return c.json({ duty: dutyRecord }, 201);
};

export const removeDutyController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const { userId, duty } = await c.req.json();
  if (!userId || !duty) return c.json({ message: 'userId and duty are required' }, 400);
  const result = await removeDuty(id, userId, duty);
  return c.json(result, 200);
};

export const duties = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const dutiesList = await getEventDuties(id);
  return c.json({ duties: dutiesList }, 200);
};

export const myDuties = async (c: Context) => {
  const user = c.get('user');
  const dutiesList = await getMyDuties(user.id);
  return c.json({ duties: dutiesList }, 200);
};

export const myRegistrations = async (c: Context) => {
  const user = c.get('user');
  const regs = await getMyRegistrations(user.id);
  return c.json({ registrations: regs }, 200);
};

export const guestRegister = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const body = await c.req.json();

  if (!body.studentId || !body.email || !body.name || !body.gender) {
    return c.json({ message: 'studentId, email, name, and gender are required' }, 400);
  }

  const result = await guestRegisterForEvent(id, {
    studentId: body.studentId,
    email: body.email,
    name: body.name,
    gender: body.gender,
    customFieldResponses: body.customFieldResponses,
    paymentMethod: body.paymentMethod,
    transactionId: body.transactionId,
  });

  return c.json(result, 201);
};

// ─── Event Manager Controllers ───

export const addManagerController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const { userId } = await c.req.json();
  if (!userId) return c.json({ message: 'userId is required' }, 400);
  const user = c.get('user');
  const manager = await addEventManager(id, userId, user.id);
  return c.json({ manager }, 201);
};

export const removeManagerController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const { userId } = await c.req.json();
  if (!userId) return c.json({ message: 'userId is required' }, 400);
  const result = await removeEventManager(id, userId);
  return c.json(result, 200);
};

export const managersController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const managers = await getEventManagers(id);
  return c.json({ managers }, 200);
};

export const myManagedEventsController = async (c: Context) => {
  const user = c.get('user');
  const events = await getMyManagedEvents(user.id);
  return c.json({ events }, 200);
};

export const managedEventRegistrations = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const allowed = await isEventManager(id, user.id);
  if (!allowed) return c.json({ message: 'You are not a manager for this event' }, 403);
  const regs = await getEventRegistrations(id);
  return c.json({ registrations: regs }, 200);
};

// ══════════════════════════════════════════════
// FINANCIAL CONTROLLERS
// ══════════════════════════════════════════════

// ─── Event Expenses ───

export const addExpenseController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');

  const contentType = c.req.header('content-type') ?? '';
  let data: { description: string; amount: number; category?: string; receiptImage?: string };

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    let receiptImage: string | undefined;
    const receiptFile = formData.get('receipt') as File | null;
    if (receiptFile && receiptFile.size > 0) {
      receiptImage = await uploadImageToCloudinary(receiptFile);
    }
    data = {
      description: formData.get('description') as string,
      amount: Number(formData.get('amount')),
      category: (formData.get('category') as string) || undefined,
      receiptImage,
    };
  } else {
    data = await c.req.json();
  }

  const expense = await addEventExpense(id, data, user.id);
  return c.json({ expense }, 201);
};

export const updateExpenseController = async (c: Context) => {
  const expenseId = parseInt(c.req.param('expenseId'));
  if (isNaN(expenseId)) return c.json({ message: 'Invalid expense ID' }, 400);

  const contentType = c.req.header('content-type') ?? '';
  let data: { description?: string; amount?: number; category?: string; receiptImage?: string };

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    data = {};
    const desc = formData.get('description') as string;
    if (desc) data.description = desc;
    const amt = formData.get('amount');
    if (amt) data.amount = Number(amt);
    const cat = formData.get('category') as string;
    if (cat) data.category = cat;
    const receiptFile = formData.get('receipt') as File | null;
    if (receiptFile && receiptFile.size > 0) {
      data.receiptImage = await uploadImageToCloudinary(receiptFile);
    }
  } else {
    data = await c.req.json();
  }

  const expense = await updateEventExpense(expenseId, data);
  return c.json({ expense }, 200);
};

export const deleteExpenseController = async (c: Context) => {
  const expenseId = parseInt(c.req.param('expenseId'));
  if (isNaN(expenseId)) return c.json({ message: 'Invalid expense ID' }, 400);
  const result = await deleteEventExpense(expenseId);
  return c.json(result, 200);
};

export const listExpensesController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const expenses = await getEventExpenses(id);
  return c.json({ expenses }, 200);
};

// ─── Expense Claims ───

export const submitClaimController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');

  const contentType = c.req.header('content-type') ?? '';
  let data: { description: string; amount: number; proofImage: string };

  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    let proofImage = '';
    const proofFile = formData.get('proof') as File | null;
    if (proofFile && proofFile.size > 0) {
      proofImage = await uploadImageToCloudinary(proofFile);
    }
    data = {
      description: formData.get('description') as string,
      amount: Number(formData.get('amount')),
      proofImage,
    };
  } else {
    data = await c.req.json();
  }

  const claim = await submitExpenseClaim(id, user.id, data);
  return c.json({ claim }, 201);
};

export const reviewClaimController = async (c: Context) => {
  const claimId = parseInt(c.req.param('claimId'));
  if (isNaN(claimId)) return c.json({ message: 'Invalid claim ID' }, 400);
  const user = c.get('user');
  const { approved, notes } = await c.req.json();
  if (typeof approved !== 'boolean')
    return c.json({ message: 'approved (boolean) is required' }, 400);
  const claim = await reviewExpenseClaim(claimId, user.id, approved, notes);
  return c.json({ claim }, 200);
};

export const markClaimPaidController = async (c: Context) => {
  const claimId = parseInt(c.req.param('claimId'));
  if (isNaN(claimId)) return c.json({ message: 'Invalid claim ID' }, 400);
  const user = c.get('user');

  let paymentProofUrl: string | undefined;
  const contentType = c.req.header('content-type') || '';
  if (contentType.includes('multipart/form-data')) {
    const formData = await c.req.formData();
    const proofFile = formData.get('paymentProof') as File | null;
    if (proofFile && proofFile.size > 0) {
      paymentProofUrl = await uploadImageToCloudinary(proofFile);
    }
  }

  const claim = await markClaimPaid(claimId, user.id, paymentProofUrl);
  return c.json({ claim }, 200);
};

export const listClaimsController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const claims = await getEventClaims(id);
  return c.json({ claims }, 200);
};

export const myClaimsController = async (c: Context) => {
  const user = c.get('user');
  const claims = await getMyClaims(user.id);
  return c.json({ claims }, 200);
};

// ─── Financials & Voucher ───

export const financialsController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const financials = await getEventFinancials(id);
  return c.json({ financials }, 200);
};

export const generateVoucherController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const voucher = await generateVoucher(id, user.id);
  return c.json({ voucher }, 201);
};

export const regenerateVoucherController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const user = c.get('user');
  const voucher = await regenerateVoucher(id, user.id);
  return c.json({ voucher }, 200);
};

export const getVoucherController = async (c: Context) => {
  const id = parseInt(c.req.param('id'));
  if (isNaN(id)) return c.json({ message: 'Invalid event ID' }, 400);
  const voucher = await getEventVoucher(id);
  if (!voucher) return c.json({ message: 'No voucher generated for this event yet' }, 404);
  return c.json({ voucher }, 200);
};
