const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Make a value safe to put inside HTML text or a quoted attribute. Use it for
 * anything a user or officer typed (names, titles, venues, notes) before it
 * goes into an email body. Not for subject lines, which are plain text.
 */
export const escapeHtml = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
