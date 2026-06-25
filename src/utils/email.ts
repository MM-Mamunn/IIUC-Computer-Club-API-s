import nodemailer from 'nodemailer';
import { formatBangladeshDateTime } from './datetime';

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE =
  process.env.SMTP_SECURE === 'true' || (process.env.SMTP_SECURE !== 'false' && SMTP_PORT === 465);

const EMAIL_MAX_RETRIES = Number(process.env.EMAIL_MAX_RETRIES || 6);
const EMAIL_MIN_INTERVAL_MS = Number(process.env.EMAIL_MIN_INTERVAL_MS || 1500);
const EMAIL_RETRY_BASE_MS = Number(process.env.EMAIL_RETRY_BASE_MS || 1000);
const EMAIL_RETRY_MAX_MS = Number(process.env.EMAIL_RETRY_MAX_MS || 30000);
const EMAIL_SEND_TIMEOUT_MS = Number(process.env.EMAIL_SEND_TIMEOUT_MS || 20000);
const EMAIL_VERIFY_CACHE_MS = Number(process.env.EMAIL_VERIFY_CACHE_MS || 120000);

const transporter = nodemailer.createTransport({
  host: SMTP_HOST,
  port: SMTP_PORT,
  secure: SMTP_SECURE,
  // Require STARTTLS when not using implicit TLS (465)
  requireTLS: !SMTP_SECURE,
  pool: true,
  maxConnections: 1,
  maxMessages: Number(process.env.EMAIL_MAX_MESSAGES_PER_CONNECTION || 100),
  connectionTimeout: Number(process.env.EMAIL_CONNECTION_TIMEOUT_MS || 10000),
  greetingTimeout: Number(process.env.EMAIL_GREETING_TIMEOUT_MS || 10000),
  socketTimeout: Number(process.env.EMAIL_SOCKET_TIMEOUT_MS || 20000),
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// Gmail SMTP strictly requires the From address to exactly match the authenticated
// SMTP_USER account. Using any other address (e.g. a custom SMTP_FROM like
// noreply@iiuccc.com) causes Gmail — and recipient Google Workspace servers such as
// @ugrad.iiuc.ac.bd — to reject the message with "Message rejected / blocked".
// Therefore we always derive FROM from SMTP_USER and ignore any SMTP_FROM override.
const FROM = process.env.SMTP_USER
  ? `"IIUC Computer Club" <${process.env.SMTP_USER}>`
  : '"IIUC Computer Club" <computerclub@iiuc.ac.bd>';

type MailOptions = Parameters<typeof transporter.sendMail>[0];
type SendMailResult = Awaited<ReturnType<typeof transporter.sendMail>>;

type SmtpLikeError = Error & {
  code?: string;
  responseCode?: number;
  response?: string;
};

let mailQueue: Promise<void> = Promise.resolve();
let lastSentAt = 0;
let verifiedUntil = 0;
let verifyPromise: Promise<void> | null = null;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string,
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(timeoutMessage)), timeoutMs);
  });

  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function jitterMs(maxMs = 400) {
  return Math.floor(Math.random() * Math.max(1, maxMs));
}

function toSmtpError(error: unknown): SmtpLikeError {
  if (error instanceof Error) return error as SmtpLikeError;
  return new Error('Unknown SMTP error') as SmtpLikeError;
}

function isTransientSmtpError(error: SmtpLikeError) {
  const transientCodes = new Set([
    'ETIMEDOUT',
    'ESOCKET',
    'ECONNECTION',
    'ECONNRESET',
    'EAI_AGAIN',
    'ENOTFOUND',
  ]);

  if (error.code && transientCodes.has(error.code)) {
    return true;
  }

  if (error.responseCode && [421, 429, 450, 451, 452, 454].includes(error.responseCode)) {
    return true;
  }

  const message = `${error.message || ''} ${error.response || ''}`.toLowerCase();
  return (
    message.includes('temporar') ||
    message.includes('try again later') ||
    message.includes('rate limit') ||
    message.includes('too many') ||
    message.includes('throttl')
  );
}

async function waitForQueueSlot() {
  const now = Date.now();
  const wait = Math.max(0, lastSentAt + EMAIL_MIN_INTERVAL_MS - now);
  if (wait > 0) {
    await sleep(wait + jitterMs(150));
  }
  lastSentAt = Date.now();
}

async function ensureTransportVerified() {
  if (Date.now() < verifiedUntil) return;

  if (!verifyPromise) {
    verifyPromise = withTimeout(
      transporter.verify(),
      EMAIL_SEND_TIMEOUT_MS,
      'SMTP verify timed out',
    )
      .then(() => {
        verifiedUntil = Date.now() + EMAIL_VERIFY_CACHE_MS;
      })
      .finally(() => {
        verifyPromise = null;
      });
  }

  await verifyPromise;
}

async function sendMailWithRetry(message: MailOptions, attempts = EMAIL_MAX_RETRIES) {
  let lastError: SmtpLikeError | null = null;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await ensureTransportVerified();
      return await withTimeout(
        transporter.sendMail(message),
        EMAIL_SEND_TIMEOUT_MS,
        'SMTP send timed out',
      );
    } catch (error) {
      const smtpError = toSmtpError(error);
      lastError = smtpError;
      const transient = isTransientSmtpError(smtpError);
      const isLastAttempt = attempt >= attempts;

      console.error('[email] send failed', {
        attempt,
        attempts,
        transient,
        code: smtpError.code,
        responseCode: smtpError.responseCode,
        message: smtpError.message,
        to: message.to,
        subject: message.subject,
      });

      if (!transient || isLastAttempt) {
        break;
      }

      const baseDelay = Math.min(EMAIL_RETRY_BASE_MS * 2 ** (attempt - 1), EMAIL_RETRY_MAX_MS);
      await sleep(baseDelay + jitterMs());

      // Force a fresh SMTP verify for next retry after transient failures.
      verifiedUntil = 0;
    }
  }

  throw lastError ?? new Error('Failed to send email');
}

async function enqueueMail(message: MailOptions) {
  const run = mailQueue
    .catch(() => undefined)
    .then(async () => {
      await waitForQueueSlot();
      return sendMailWithRetry(message);
    });
  mailQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/** Generate a random 8-character temporary password */
export function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
  let pw = '';
  for (let i = 0; i < 8; i++) {
    pw += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return pw;
}

/** Send welcome email with temporary password to a new auto-created account */
export async function sendWelcomeEmail(
  to: string,
  name: string,
  studentId: string,
  tempPassword: string,
) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #333; margin-top: 0;">Welcome, ${name}!</h2>
        <p style="color: #555; line-height: 1.6;">
          An account has been created for you on the IIUC Computer Club platform.
          Use the credentials below to log in to your dashboard.
        </p>
        <div style="background: #fff; border: 1px solid #e0e0e0; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>ID:</strong> ${studentId}</p>
          <p style="margin: 4px 0;"><strong>Temporary Password:</strong> <code style="background: #eee; padding: 2px 8px; border-radius: 4px; font-size: 16px;">${tempPassword}</code></p>
        </div>
        <p style="color: #d32f2f; font-weight: bold;">
          ⚠️ You must change your password on first login before you can access your dashboard.
        </p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: 'Welcome to IIUC Computer Club — Your Account Credentials',
      html,
    });
  } catch (err) {
    console.error('Failed to send welcome email:', err);
    throw err;
  }
}

/** Send event registration confirmation email */
export async function sendEventRegistrationEmail(
  to: string,
  name: string,
  eventTitle: string,
  eventDate: string,
  venue: string | null,
  isPaid: boolean,
  fee: number,
  isDonation?: boolean,
) {
  const dateStr = formatBangladeshDateTime(eventDate);
  const isPending = isPaid || isDonation;

  const paymentLine = isDonation
    ? '<p style="margin: 4px 0; color: #555;">🤝 <strong>Donation Event</strong></p>'
    : isPaid
      ? `<p style="margin: 4px 0; color: #555;">💰 <strong>Fee:</strong> ৳${fee}</p>`
      : '<p style="margin: 4px 0; color: #555;">🆓 <strong>Free Event</strong></p>';

  const emailSubject = isPending
    ? `Registration Request Received — ${eventTitle}`
    : `Registration Confirmed — ${eventTitle}`;

  const bannerBg = isPending ? '#fffbeb' : '#f0f9f0';
  const bannerBorder = isPending ? '#fde68a' : '#c8e6c9';
  const headingColor = isPending ? '#b45309' : '#2e7d32';
  const headingText = isPending ? 'Registration Received! 📝' : 'Registration Confirmed! ✅';

  const bodyText = isPending
    ? `Hi <strong>${name}</strong>, we have received your registration request and payment details for the following event:`
    : `Hi <strong>${name}</strong>, you have successfully registered for the following event:`;

  const pendingNote = isPending
    ? '<p style="color: #b45309; font-weight: bold; margin-top: 16px;">Your registration and payment information are currently pending verification. We will verify the details and notify you once your registration is fully confirmed.</p>'
    : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: ${bannerBg}; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: ${headingColor}; margin-top: 0;">${headingText}</h2>
        <p style="color: #555; line-height: 1.6;">
          ${bodyText}
        </p>
        <div style="background: #fff; border: 1px solid ${bannerBorder}; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${eventTitle}</h3>
          <p style="margin: 4px 0; color: #555;">📅 <strong>Date:</strong> ${dateStr}</p>
          ${venue ? `<p style="margin: 4px 0; color: #555;">📍 <strong>Venue:</strong> ${venue}</p>` : ''}
          ${paymentLine}
        </div>
        ${pendingNote}
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: emailSubject,
      html,
    });
  } catch (err) {
    console.error('Failed to send event registration email:', err);
    throw err;
  }
}

/** Send payment confirmed email */
export async function sendPaymentConfirmedEmail(
  to: string,
  name: string,
  eventTitle: string,
  eventDate: string,
  venue: string | null,
  fee: number,
  isDonation?: boolean,
) {
  const dateStr = formatBangladeshDateTime(eventDate);

  const amountLine = isDonation
    ? '<p style="margin: 4px 0; color: #555;">🤝 <strong>Donation Received</strong> — Thank you for your generosity!</p>'
    : `<p style="margin: 4px 0; color: #555;">💰 <strong>Amount Paid:</strong> ৳${fee}</p>`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #f0f9f0; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #2e7d32; margin-top: 0;">Payment Confirmed! ✅</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, your payment has been verified for the following event:
        </p>
        <div style="background: #fff; border: 1px solid #c8e6c9; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${eventTitle}</h3>
          <p style="margin: 4px 0; color: #555;">📅 <strong>Date:</strong> ${dateStr}</p>
          ${venue ? `<p style="margin: 4px 0; color: #555;">📍 <strong>Venue:</strong> ${venue}</p>` : ''}
          ${amountLine}
        </div>
        <p style="color: #2e7d32; font-weight: bold;">Your registration is now fully confirmed. See you at the event!</p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: `Payment Confirmed — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send payment confirmed email:', err);
    throw err;
  }
}

/** Send password reset email with a reset link */
export async function sendPasswordResetEmail(to: string, name: string, resetLink: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #fff3e0; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #e65100; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, we received a request to reset your password.
          Click the button below to set a new password:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${resetLink}" style="background: #1976d2; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; display: inline-block;">
            Reset Password
          </a>
        </div>
        <p style="color: #555; line-height: 1.6;">
          Or copy and paste this link into your browser:
        </p>
        <p style="color: #1976d2; word-break: break-all; font-size: 13px;">
          ${resetLink}
        </p>
        <p style="color: #d32f2f; font-weight: bold; margin-top: 16px;">
          ⚠️ This link will expire in 15 minutes. If you did not request this, please ignore this email.
        </p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: 'Password Reset — IIUC Computer Club',
      html,
    });
  } catch (err) {
    console.error('Failed to send password reset email:', err);
    throw err;
  }
}

/** Send payment rejection email with a link to fix payment */
export async function sendPaymentRejectionEmail(
  to: string,
  name: string,
  eventTitle: string,
  eventDate: string,
  venue: string | null,
  rejectionReason: string,
  fixPaymentLink: string,
  fee: number,
  isDonation: boolean,
  rejectionType: string = 'other',
  amountDeficit?: number,
) {
  const dateStr = formatBangladeshDateTime(eventDate);

  const amountLine = isDonation
    ? '<p style="margin: 4px 0; color: #555;">🤝 <strong>Donation Event</strong></p>'
    : `<p style="margin: 4px 0; color: #555;">💰 <strong>Amount Required:</strong> ৳${fee}</p>`;

  // Type-specific content
  let reasonTitle = 'Issue Details:';
  let reasonMessage = rejectionReason;
  let instructionText =
    'Please click the button below to view and update your registration details.';
  let buttonLabel = 'Update Registration';
  let extraInfo = '';

  if (rejectionType === 'incorrect_trxid') {
    reasonTitle = 'Issue: Incorrect Transaction ID';
    reasonMessage =
      'Your transaction ID could not be verified or was entered incorrectly. Please submit the correct transaction ID.';
    instructionText =
      'Click the button below to submit your correct Transaction ID.';
    buttonLabel = 'Update Transaction ID';
  } else if (rejectionType === 'incorrect_amount') {
    reasonTitle = 'Issue: Incorrect Payment Amount';
    if (amountDeficit && amountDeficit > 0) {
      reasonMessage = `The payment amount you submitted does not match the required amount. You need to pay <strong>৳${amountDeficit}</strong> more to complete your registration.`;
      extraInfo = `
        <div style="background: #fffbeb; border: 1px solid #fcd34d; border-radius: 6px; padding: 16px; margin: 16px 0; text-align: center;">
          <p style="margin: 0; color: #92400e; font-weight: bold; font-size: 16px;">Amount Due: ৳${amountDeficit}</p>
          <p style="margin: 4px 0 0; color: #92400e; font-size: 13px;">Please pay this remaining amount to complete your registration.</p>
        </div>`;
    } else {
      reasonMessage =
        'The payment amount you submitted does not match the required amount. Please make a new payment with the correct amount.';
    }
    instructionText = 'Click the button below to submit the remaining payment.';
    buttonLabel = 'Pay Remaining Amount';
  } else if (rejectionType === 'payment_not_found') {
    reasonTitle = 'Issue: Payment Not Found (Invalid Transaction ID)';
    reasonMessage =
      'We could not verify your payment. It appears the transaction ID submitted is invalid or no payment was received. Please make a fresh payment of the full amount and submit the correct transaction ID.';
    instructionText = 'Click the button below to complete the full payment and submit your details.';
    buttonLabel = 'Submit Full Payment';
  } else if (rejectionType === 'form_not_submitted') {
    reasonTitle = 'Issue: Google Form Submission Not Found';
    reasonMessage =
      'We could not verify your registration because we did not find a matching response in our Google Form records. Please make sure you have filled out the Google Form and resubmit your details.';
    instructionText = 'Click the button below to review your details and access the Google Form.';
    buttonLabel = 'Complete Registration Form';
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #fffbeb; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #b45309; margin-top: 0;">Registration Action Required ⚠️</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, there is an issue with your registration for the following event:
        </p>
        <div style="background: #fff; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${eventTitle}</h3>
          <p style="margin: 4px 0; color: #555;">📅 <strong>Date:</strong> ${dateStr}</p>
          ${venue ? `<p style="margin: 4px 0; color: #555;">📍 <strong>Venue:</strong> ${venue}</p>` : ''}
          ${amountLine}
        </div>
        <div style="background: #fff; border: 1px solid #fde68a; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #b45309; font-weight: bold;">${reasonTitle}</p>
          <p style="margin: 8px 0 0; color: #555;">${reasonMessage}</p>
        </div>
        ${extraInfo}
        <p style="color: #555; line-height: 1.6;">
          ${instructionText}
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${fixPaymentLink}" style="background: #1976d2; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; display: inline-block;">
            ${buttonLabel}
          </a>
        </div>
        <p style="color: #555; line-height: 1.6;">
          Or copy and paste this link into your browser:
        </p>
        <p style="color: #1976d2; word-break: break-all; font-size: 13px;">
          ${fixPaymentLink}
        </p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  const subjectSuffix =
    rejectionType === 'incorrect_trxid'
      ? 'Action Required: Incorrect Transaction ID'
      : rejectionType === 'incorrect_amount'
        ? 'Action Required: Incorrect Payment Amount'
        : rejectionType === 'payment_not_found'
          ? 'Action Required: Payment Not Found'
          : 'Action Required: Registration Update Needed';

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: `${subjectSuffix} — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send payment rejection email:', err);
    throw err;
  }
}

/** Notify student that a refund case has been opened for their registration */
export async function sendRefundOpenedEmail(
  to: string,
  name: string,
  eventTitle: string,
  refundAmount: number,
) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #fdf6ec; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #b45309; margin-top: 0;">Event Cancelled — Refund Initiated 💸</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, unfortunately the event <strong>${eventTitle}</strong> has been cancelled.
        </p>
        <p style="color: #555; line-height: 1.6;">
          We will refund your full registration fee of <strong>৳${refundAmount}</strong>.
        </p>
        <p style="color: #555; line-height: 1.6;">
          Please log in to your dashboard and navigate to <strong>My Refunds</strong>
          to submit your preferred refund destination (bKash, Nagad, or cash pickup).
        </p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: `Refund Initiated — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send refund opened email:', err);
    throw err;
  }
}

/** Notify student of a refund status change */
export async function sendRefundStatusEmail(
  to: string,
  name: string,
  eventTitle: string,
  status: string,
  rejectionReason?: string,
) {
  const statusMessages: Record<string, { headline: string; body: string; color: string }> = {
    approved: {
      headline: 'Refund Approved ✅',
      body: 'Your refund destination has been reviewed and approved. The organizer will process your refund shortly.',
      color: '#2e7d32',
    },
    rejected: {
      headline: 'Refund Destination Rejected ❌',
      body: `Your refund destination was rejected${rejectionReason ? `: <em>${rejectionReason}</em>` : ''}. Please log in and resubmit with correct information.`,
      color: '#c62828',
    },
    paid: {
      headline: 'Refund Sent 💸',
      body: 'Your refund has been processed and sent. Please log in to confirm receipt and view the proof of payment.',
      color: '#1565c0',
    },
  };

  const meta = statusMessages[status];
  if (!meta) return;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #f8f9fa; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: ${meta.color}; margin-top: 0;">${meta.headline}</h2>
        <p style="color: #555; line-height: 1.6;">Hi <strong>${name}</strong>,</p>
        <p style="color: #555; line-height: 1.6;">${meta.body}</p>
        <p style="color: #555; line-height: 1.6;">Event: <strong>${eventTitle}</strong></p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: `Refund Update — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send refund status email:', err);
    throw err;
  }
}

/** Send duty or event manager assignment notification email */
export async function sendDutyAssignmentEmail(
  to: string,
  name: string,
  eventTitle: string,
  assignedRole: string,
  eventDate: string,
  venue: string | null,
  dashboardLink: string,
) {
  const dateStr = formatBangladeshDateTime(eventDate);
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #fdf6ec; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #b45309; margin-top: 0;">New Event Assignment 📅</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, you have been assigned a new role/duty for the following event:
        </p>
        <div style="background: #fff; border: 1px solid #fcd34d; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${eventTitle}</h3>
          <p style="margin: 4px 0; color: #555;">📋 <strong>Assigned Role:</strong> ${assignedRole}</p>
          <p style="margin: 4px 0; color: #555;">📅 <strong>Event Date:</strong> ${dateStr}</p>
          ${venue ? `<p style="margin: 4px 0; color: #555;">📍 <strong>Event Location:</strong> ${venue}</p>` : ''}
        </div>
        <p style="color: #555; line-height: 1.6;">
          You can view and manage your assigned duties inside your dashboard:
        </p>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${dashboardLink}" style="background: #1976d2; color: #fff; text-decoration: none; padding: 12px 32px; border-radius: 6px; font-weight: bold; display: inline-block;">
            Go to Dashboard
          </a>
        </div>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: `New Event Assignment: ${assignedRole} — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send duty assignment email:', err);
    throw err;
  }
}
