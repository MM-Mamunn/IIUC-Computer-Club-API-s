/** Frontend origins the API trusts, for CORS and for links it puts in emails and redirects. */
export const ALLOWED_ORIGINS = [
  'https://computerclub.iiuc.ac.bd',
  'https://www.computerclub.iiuc.ac.bd',
  'https://iiuccomputerclub.vercel.app',
  'https://www.iiuccomputerclub.vercel.app',
  'https://iiuccomputerclub.netlify.app',
  'https://www.iiuccomputerclub.netlify.app',
  'https://iiuc-computer-club-one.vercel.app',
  'https://www.iiuc-computer-club-one.vercel.app',
  // Local development only. In production this would let a reset email link
  // to whatever runs on the user's own machine.
  ...(process.env.VERCEL_ENV === 'production' ? [] : ['http://localhost:3000']),
];

// Netlify deploy previews and branch deploys, e.g. deploy-preview-4--iiuccomputerclub.netlify.app
const NETLIFY_PREVIEW_ORIGIN = /^https:\/\/[a-z0-9-]+--iiuccomputerclub\.netlify\.app$/;

export const isAllowedOrigin = (origin: string) =>
  ALLOWED_ORIGINS.includes(origin) || NETLIFY_PREVIEW_ORIGIN.test(origin);

const DEFAULT_FRONTEND_URL = (process.env.FRONTEND_URL || 'https://computerclub.iiuc.ac.bd').replace(
  /\/+$/,
  '',
);

/**
 * The frontend base URL to use in a link, given one a client sent. Anything
 * that isn't one of our own sites falls back to the main site, so a request
 * can't make a reset email or payment redirect point somewhere else.
 */
export const resolveFrontendUrl = (candidate: unknown): string => {
  if (typeof candidate !== 'string') return DEFAULT_FRONTEND_URL;
  const trimmed = candidate.trim().replace(/\/+$/, '');
  return isAllowedOrigin(trimmed) ? trimmed : DEFAULT_FRONTEND_URL;
};
