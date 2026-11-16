import { HTTPException } from 'hono/http-exception';

/** Profile link fields that the site shows as clickable links */
export const LINK_FIELDS = ['githubUrl', 'linkedinUrl', 'facebookUrl', 'twitterUrl', 'portfolioUrl'] as const;

/**
 * A profile link as a safe web address. Adds https:// when it's missing
 * ("github.com/me" works) and refuses any other scheme, e.g. javascript:,
 * which would run script for whoever clicks the link.
 */
export const cleanLink = (value: unknown): string | undefined => {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (!v) return '';
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(v)?.[1]?.toLowerCase();
  if (scheme && scheme !== 'http' && scheme !== 'https') {
    // "localhost:3000" or "site.com:8080/x" parse as a scheme but are really host:port
    if (!/^[a-z0-9.-]+:\d+(\/|$)/i.test(v)) {
      throw new HTTPException(400, { message: 'Links must be web addresses (http:// or https://)' });
    }
  }
  const url = scheme === 'http' || scheme === 'https' ? v : `https://${v}`;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('.')) throw new Error('no domain');
  } catch {
    throw new HTTPException(400, { message: 'Please enter a valid link, e.g. https://github.com/yourname' });
  }
  return url;
};

/** Clean every link field present on an input object, in place */
export const cleanLinks = <T extends object>(data: T): T => {
  const record = data as Record<string, unknown>;
  for (const key of LINK_FIELDS) {
    if (key in record && record[key] != null) record[key] = cleanLink(record[key]);
  }
  return data;
};
