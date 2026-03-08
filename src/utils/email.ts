import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

const FROM = process.env.SMTP_FROM || '"IIUC Computer Club" <noreply@iiuccc.com>';

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
    await transporter.sendMail({
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
) {
  const dateStr = new Date(eventDate).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

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
          ${isPaid ? `<p style="margin: 4px 0; color: #555;">💰 <strong>Fee:</strong> ৳${fee}</p>` : '<p style="margin: 4px 0; color: #555;">🆓 <strong>Free Event</strong></p>'}
        </div>
        ${isPaid ? '<p style="color: #f57c00;">Your payment is pending verification. You will be notified once it is confirmed.</p>' : ''}
        <p style="color: #555;">We look forward to seeing you at the event!</p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
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
) {
  const dateStr = new Date(eventDate).toLocaleString('en-US', {
    dateStyle: 'full',
    timeStyle: 'short',
  });

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
          <p style="margin: 4px 0; color: #555;">💰 <strong>Amount Paid:</strong> ৳${fee}</p>
        </div>
        <p style="color: #2e7d32; font-weight: bold;">Your registration is now fully confirmed. See you at the event!</p>
      </div>
      <p style="color: #999; font-size: 12px; text-align: center;">
        This is an automated message from IIUC Computer Club. Please do not reply.
      </p>
    </div>
  `;

  try {
    await transporter.sendMail({
      from: FROM,
      to,
      subject: `Payment Confirmed — ${eventTitle}`,
      html,
    });
  } catch (err) {
    console.error('Failed to send payment confirmed email:', err);
  }
}
