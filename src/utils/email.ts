import nodemailer from 'nodemailer';
import { formatBangladeshDateTime } from './datetime';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  pool: true,
  maxConnections: 1,
  maxMessages: 50,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FALLBACK_FROM = process.env.SMTP_USER
  ? `"IIUC Computer Club" <${process.env.SMTP_USER}>`
  : '"IIUC Computer Club" <noreply@iiuccc.com>';
const FROM = process.env.SMTP_FROM || FALLBACK_FROM;

type MailOptions = Parameters<typeof transporter.sendMail>[0];

let mailQueue: Promise<void> = Promise.resolve();

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sendMailWithRetry(message: MailOptions, attempts = 3) {
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await transporter.sendMail(message);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await sleep(250 * attempt);
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Failed to send email');
}

async function enqueueMail(message: MailOptions) {
  const run = mailQueue.catch(() => undefined).then(() => sendMailWithRetry(message));
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
          <p style="margin: 4px 0;"><strong>Student ID:</strong> ${studentId}</p>
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

  const paymentLine = isDonation
    ? '<p style="margin: 4px 0; color: #555;">🤝 <strong>Donation Event</strong></p>'
    : isPaid
      ? `<p style="margin: 4px 0; color: #555;">💰 <strong>Fee:</strong> ৳${fee}</p>`
      : '<p style="margin: 4px 0; color: #555;">🆓 <strong>Free Event</strong></p>';

  const pendingNote =
    isPaid || isDonation
      ? '<p style="color: #f57c00;">Your payment is pending verification. You will be notified once it is confirmed.</p>'
      : '';

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #f0f9f0; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #2e7d32; margin-top: 0;">Registration Confirmed! ✅</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, you have successfully registered for the following event:
        </p>
        <div style="background: #fff; border: 1px solid #c8e6c9; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${eventTitle}</h3>
          <p style="margin: 4px 0; color: #555;">📅 <strong>Date:</strong> ${dateStr}</p>
          ${venue ? `<p style="margin: 4px 0; color: #555;">📍 <strong>Venue:</strong> ${venue}</p>` : ''}
          ${paymentLine}
        </div>
        ${pendingNote}
        <p style="color: #555;">We look forward to seeing you at the event!</p>
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
      subject: `Registration Confirmed — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send event registration email:', err);
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
  let reasonTitle = 'Reason for Rejection:';
  let reasonMessage = rejectionReason;
  let instructionText =
    'Please submit a new payment using the button below. Make sure to use the correct amount and payment method.';
  let buttonLabel = 'Fix Payment';
  let extraInfo = '';

  if (rejectionType === 'incorrect_trxid') {
    reasonTitle = 'Issue: Incorrect Transaction ID';
    reasonMessage =
      'Your transaction ID could not be verified or was entered incorrectly. Please submit the correct transaction ID.';
    instructionText =
      'Click the button below to submit your correct Transaction ID. You do not need to make a new payment.';
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
  }

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h1 style="color: #1a1a1a; margin: 0;">IIUC Computer Club</h1>
      </div>
      <div style="background: #fef2f2; border-radius: 8px; padding: 24px; margin-bottom: 16px;">
        <h2 style="color: #dc2626; margin-top: 0;">Payment Rejected ❌</h2>
        <p style="color: #555; line-height: 1.6;">
          Hi <strong>${name}</strong>, your payment for the following event has been rejected:
        </p>
        <div style="background: #fff; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <h3 style="margin-top: 0; color: #1a1a1a;">${eventTitle}</h3>
          <p style="margin: 4px 0; color: #555;">📅 <strong>Date:</strong> ${dateStr}</p>
          ${venue ? `<p style="margin: 4px 0; color: #555;">📍 <strong>Venue:</strong> ${venue}</p>` : ''}
          ${amountLine}
        </div>
        <div style="background: #fff; border: 1px solid #fecaca; border-radius: 6px; padding: 16px; margin: 16px 0;">
          <p style="margin: 0; color: #dc2626; font-weight: bold;">${reasonTitle}</p>
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
      ? 'Incorrect Transaction ID'
      : rejectionType === 'incorrect_amount'
        ? 'Incorrect Payment Amount'
        : 'Payment Rejected';

  try {
    await enqueueMail({
      from: FROM,
      to,
      subject: `${subjectSuffix} — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send payment rejection email:', err);
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
  }
}
