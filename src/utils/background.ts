import { waitUntil } from '@vercel/functions';

/**
 * Run `task` without making the response wait for it (emails, follow-up
 * writes). On Vercel, waitUntil keeps the function alive until the task
 * finishes; locally it simply runs in the background. Errors are logged and
 * never reach the request, so a slow or failing mail server can't delay or
 * fail an action that has already succeeded.
 */
export const runAfterResponse = (label: string, task: () => Promise<unknown>): void => {
  const promise = Promise.resolve()
    .then(task)
    .catch((err) => {
      console.error(`[after-response] ${label} failed:`, err instanceof Error ? err.message : err);
    });

  try {
    waitUntil(promise);
  } catch {
    // Not running on Vercel: the promise still runs on its own
  }
};
