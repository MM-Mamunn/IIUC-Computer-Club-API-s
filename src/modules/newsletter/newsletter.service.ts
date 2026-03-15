import { eq } from 'drizzle-orm';
import { HTTPException } from 'hono/http-exception';
import { db } from '../../config/db';
import { newsletterSubscriptions } from '../../db/schema';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const subscribeNewsletter = async (emailInput: string) => {
  const email = emailInput.trim().toLowerCase();

  if (!email || !EMAIL_REGEX.test(email)) {
    throw new HTTPException(400, { message: 'Please enter a valid email address' });
  }

  const [existing] = await db
    .select()
    .from(newsletterSubscriptions)
    .where(eq(newsletterSubscriptions.email, email));

  if (!existing) {
    await db.insert(newsletterSubscriptions).values({
      email,
      isActive: true,
      source: 'landing-footer',
    });

    return {
      status: 'subscribed' as const,
      email,
      message: 'Subscribed successfully. You will receive club updates.',
    };
  }

  if (existing.isActive) {
    return {
      status: 'already-active' as const,
      email,
      message: 'This email is already subscribed.',
    };
  }

  await db
    .update(newsletterSubscriptions)
    .set({
      isActive: true,
      subscribedAt: new Date(),
      source: 'landing-footer',
    })
    .where(eq(newsletterSubscriptions.email, email));

  return {
    status: 'reactivated' as const,
    email,
    message: 'Subscription reactivated successfully.',
  };
};
