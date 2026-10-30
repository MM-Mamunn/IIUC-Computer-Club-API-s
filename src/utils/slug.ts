/**
 * Turn any text into a URL-safe slug.
 *
 * NFKD first, so "styled" Unicode letters that event titles are often pasted
 * with (e.g. "𝐅𝐀𝐑𝐄𝐖𝐄𝐋𝐋 𝟐𝟎𝟐𝟔" from Facebook posts, full-width "ＡＢＣ",
 * ligatures like "ﬁ") become plain ASCII, and accents split off ("é" → "e").
 * Characters with no ASCII form (e.g. Bangla script) are dropped; callers
 * provide a fallback for an empty result.
 *
 * e.g. "𝐅𝐀𝐑𝐄𝐖𝐄𝐋𝐋 𝐅𝐄𝐋𝐈𝐂𝐈𝐓𝐀𝐓𝐈𝐎𝐍 𝟐𝟎𝟐𝟔" → "farewell-felicitation-2026"
 */
export function slugify(text: string, maxLength = 120): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // strip combining accents left by NFKD
    .toLowerCase()
    .replace(/['’]/g, '') // "Women's" → "womens", not "women-s"
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-') // everything else separates words
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength)
    .replace(/-+$/, '');
}

/** Slugs that are only digits would be read as an event id by `/events/:id`. */
export const isNumericSlug = (slug: string) => /^\d+$/.test(slug);
