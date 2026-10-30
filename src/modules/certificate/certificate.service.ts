import crypto from 'node:crypto';
import { HTTPException } from 'hono/http-exception';
import { and, asc, desc, eq, inArray, isNull, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../../config/db';
import cloudinary, { isCloudinaryConfigured } from '../../config/cloudinary';
import {
  certificates,
  certificateTemplates,
  eventRegistrations,
  events,
  type CertificateField,
} from '../../db/event.schema';
import { users } from '../../db/schema';

const FIELD_TYPES = new Set(['name', 'eventTitle', 'eventDate', 'certificateId', 'matrixId', 'custom', 'qr', 'image']);
/** Field types whose `text` is used: custom text, or the label before an ID */
const TEXT_FIELD_TYPES = new Set(['custom', 'certificateId', 'matrixId']);
const MAX_FIELDS = 30;
const MAX_RECIPIENTS_PER_REQUEST = 2000;
/** Upper bound for one mark-emailed request */
const MAX_MARK_EMAILED = 500;
const BACKGROUND_FOLDER = 'ccapi/certificates';

// ─── Event checks ───

const getCertificateEvent = async (eventId: number) => {
  const [event] = await db
    .select({
      id: events.id,
      title: events.title,
      slug: events.slug,
      eventDate: events.eventDate,
      venue: events.venue,
      status: events.status,
      certificateEnabled: events.certificateEnabled,
      useExternalForm: events.useExternalForm,
      externalFormUrl: events.externalFormUrl,
    })
    .from(events)
    .where(eq(events.id, eventId));
  if (!event) throw new HTTPException(404, { message: 'Event not found' });
  if (!event.certificateEnabled) {
    throw new HTTPException(400, {
      message: 'Digital certificates are not enabled for this event. Turn them on in the event settings.',
    });
  }
  return event;
};

/** Certificates can only be issued once the event is over */
const assertCompleted = (event: { status: string | null }) => {
  if (event.status !== 'completed') {
    throw new HTTPException(400, {
      message: 'Certificates can be issued after the event is completed.',
    });
  }
};

// ─── Template ───

export const getCertificateWorkspace = async (eventId: number) => {
  const event = await getCertificateEvent(eventId);
  const [template] = await db
    .select()
    .from(certificateTemplates)
    .where(eq(certificateTemplates.eventId, eventId));
  const [{ issued }] = await db
    .select({ issued: sql<number>`count(*)::int` })
    .from(certificates)
    .where(and(eq(certificates.eventId, eventId), isNull(certificates.revokedAt)));
  return { event, template: template ?? null, issuedCount: issued };
};

const clamp = (value: unknown, min: number, max: number, fallback: number) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const cleanString = (value: unknown, maxLength: number) =>
  typeof value === 'string' ? value.slice(0, maxLength) : undefined;

/** Keep only known field properties, with positions clamped to the background */
const sanitizeFields = (raw: unknown): CertificateField[] => {
  if (!Array.isArray(raw)) throw new HTTPException(400, { message: 'fields must be an array' });
  if (raw.length > MAX_FIELDS) {
    throw new HTTPException(400, { message: `A certificate can have at most ${MAX_FIELDS} fields` });
  }
  return raw.map((f, i) => {
    const field = (f ?? {}) as Record<string, unknown>;
    const type = String(field.type);
    if (!FIELD_TYPES.has(type)) throw new HTTPException(400, { message: `Unknown field type "${type}"` });
    const align = field.align === 'left' || field.align === 'right' ? field.align : 'center';
    const color = typeof field.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(field.color) ? field.color : '#111111';
    // Logos and signatures: must be our own uploads so the canvas can draw them
    const src = type === 'image' ? cleanString(field.src, 500) : undefined;
    if (type === 'image' && (!src || !isOwnCloudinaryUrl(src))) {
      throw new HTTPException(400, { message: 'Upload images through the certificate tool' });
    }
    return {
      id: cleanString(field.id, 40) || `field-${i + 1}`,
      type,
      text: TEXT_FIELD_TYPES.has(type) ? cleanString(field.text, 600) : undefined,
      src,
      aspect: type === 'image' ? clamp(field.aspect, 0.05, 20, 1) : undefined,
      x: clamp(field.x, 0, 1, 0.5),
      y: clamp(field.y, 0, 1, 0.5),
      size: clamp(field.size, 0.005, 0.5, 0.05),
      fontFamily: cleanString(field.fontFamily, 60),
      fontWeight: cleanString(field.fontWeight, 10),
      fontStyle: field.fontStyle === 'italic' ? 'italic' : undefined,
      wrap: type === 'custom' && field.wrap === true ? true : undefined,
      opacity: field.opacity === undefined ? undefined : clamp(field.opacity, 0.05, 1, 1),
      color,
      align,
      maxWidth: field.maxWidth === undefined ? undefined : clamp(field.maxWidth, 0.05, 1, 0.8),
    };
  });
};

/** Backgrounds must be our own Cloudinary uploads so the canvas can read them (CORS) */
const isOwnCloudinaryUrl = (url: string) => {
  const cloudName = cloudinary.config().cloud_name;
  return Boolean(cloudName) && url.startsWith(`https://res.cloudinary.com/${cloudName}/image/upload/`);
};

export const saveCertificateTemplate = async (
  eventId: number,
  body: Record<string, unknown>,
  userId: string,
) => {
  await getCertificateEvent(eventId);

  const backgroundUrl = String(body.backgroundUrl ?? '');
  if (!isOwnCloudinaryUrl(backgroundUrl)) {
    throw new HTTPException(400, { message: 'Upload the certificate design through the certificate tool' });
  }
  const width = Math.round(clamp(body.width, 1, 20000, 0));
  const height = Math.round(clamp(body.height, 1, 20000, 0));
  if (!width || !height) throw new HTTPException(400, { message: 'Background width and height are required' });

  const values = {
    eventId,
    backgroundUrl,
    width,
    height,
    fields: sanitizeFields(body.fields),
    updatedBy: userId,
    updatedAt: new Date(),
  };

  const [template] = await db
    .insert(certificateTemplates)
    .values(values)
    .onConflictDoUpdate({ target: certificateTemplates.eventId, set: values })
    .returning();
  return template;
};

/**
 * Signed parameters for uploading the design straight from the browser to
 * Cloudinary. Designs are often larger than the 4.5 MB request limit of our
 * serverless functions, so they must not pass through the API.
 */
export const getBackgroundUploadSignature = () => {
  if (!isCloudinaryConfigured()) {
    throw new HTTPException(500, { message: 'Image upload is not configured on the server' });
  }
  const config = cloudinary.config();
  const timestamp = Math.round(Date.now() / 1000);
  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder: BACKGROUND_FOLDER },
    config.api_secret!,
  );
  return {
    cloudName: config.cloud_name!,
    apiKey: config.api_key!,
    timestamp,
    folder: BACKGROUND_FOLDER,
    signature,
  };
};

// ─── Recipients ───

/** Registrations on the platform, for picking who gets a certificate */
export const getRegisteredRecipients = async (eventId: number) => {
  await getCertificateEvent(eventId);
  return db
    .select({
      userId: eventRegistrations.userId,
      name: users.name,
      email: users.email,
      paymentStatus: eventRegistrations.paymentStatus,
      registeredAt: eventRegistrations.registeredAt,
    })
    .from(eventRegistrations)
    .innerJoin(users, eq(users.id, eventRegistrations.userId))
    .where(
      and(
        eq(eventRegistrations.eventId, eventId),
        notInArray(eventRegistrations.paymentStatus, ['failed', 'draft']),
      ),
    )
    .orderBy(asc(users.name));
};

/**
 * Download a Google Sheet (e.g. the responses sheet linked to a Google Form)
 * as CSV. The sheet must be shared as "Anyone with the link can view".
 */
export const fetchGoogleSheetCsv = async (rawUrl: string) => {
  const url = String(rawUrl || '').trim();
  if (/forms\.gle|docs\.google\.com\/forms/.test(url)) {
    throw new HTTPException(400, {
      message:
        'That is the form link. Open the form → Responses → "Link to Sheets", share the sheet as "Anyone with the link", and paste the sheet link.',
    });
  }
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (!match) throw new HTTPException(400, { message: 'Paste a Google Sheets link (docs.google.com/spreadsheets/…)' });
  const gid = url.match(/[#?&]gid=(\d+)/)?.[1];
  const exportUrl = `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv${gid ? `&gid=${gid}` : ''}`;

  let response: Response;
  try {
    response = await fetch(exportUrl, { redirect: 'follow', signal: AbortSignal.timeout(15000) });
  } catch {
    throw new HTTPException(502, { message: 'Could not reach Google Sheets. Try again.' });
  }
  const contentType = response.headers.get('content-type') ?? '';
  if (!response.ok || !contentType.includes('text/csv')) {
    throw new HTTPException(400, {
      message: 'Google refused the download. Share the sheet as "Anyone with the link can view" and try again.',
    });
  }
  const csv = await response.text();
  if (csv.length > 5 * 1024 * 1024) throw new HTTPException(413, { message: 'Sheet is too large (max 5 MB)' });
  return csv;
};

// ─── Issuing ───

type RecipientInput = { name?: unknown; email?: unknown; matrixId?: unknown; source?: unknown };

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O/1/I/L
const newCode = (eventId: number) => {
  const bytes = crypto.randomBytes(7);
  const random = Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
  return `CC${eventId}-${random}`;
};

const normalizeRecipient = (r: RecipientInput) => {
  const name = String(r.name ?? '').replace(/\s+/g, ' ').trim().slice(0, 255);
  const emailRaw = String(r.email ?? '').trim().toLowerCase();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailRaw) ? emailRaw.slice(0, 255) : null;
  const matrixId = String(r.matrixId ?? '').replace(/\s+/g, '').toUpperCase().slice(0, 50) || null;
  const source = r.source === 'import' || r.source === 'manual' ? r.source : 'registration';
  return { name, email, matrixId, source };
};

/** The same person is matched by Matrix ID, then email, then exact name */
const identityKeys = (r: { name: string; email: string | null; matrixId: string | null }) =>
  [r.matrixId && `id:${r.matrixId}`, r.email && `email:${r.email}`, !r.matrixId && !r.email && `name:${r.name.toLowerCase()}`].filter(
    Boolean,
  ) as string[];

export const issueCertificates = async (eventId: number, rawRecipients: unknown, issuerId: string) => {
  const event = await getCertificateEvent(eventId);
  assertCompleted(event);
  const [template] = await db
    .select({ id: certificateTemplates.id })
    .from(certificateTemplates)
    .where(eq(certificateTemplates.eventId, eventId));
  if (!template) throw new HTTPException(400, { message: 'Design and save the certificate template first' });

  if (!Array.isArray(rawRecipients) || rawRecipients.length === 0) {
    throw new HTTPException(400, { message: 'Select at least one recipient' });
  }
  if (rawRecipients.length > MAX_RECIPIENTS_PER_REQUEST) {
    throw new HTTPException(400, { message: `Issue at most ${MAX_RECIPIENTS_PER_REQUEST} certificates at a time` });
  }

  const recipients = rawRecipients.map((r) => normalizeRecipient(r as RecipientInput)).filter((r) => r.name);
  if (recipients.length === 0) throw new HTTPException(400, { message: 'Every recipient needs a name' });

  // Existing certificates for this event, so issuing twice never duplicates anyone
  const existing = await db.select().from(certificates).where(eq(certificates.eventId, eventId));
  const byKey = new Map<string, (typeof existing)[number]>();
  for (const cert of existing) {
    for (const key of identityKeys({ name: cert.recipientName, email: cert.recipientEmail, matrixId: cert.matrixId })) {
      byKey.set(key, cert);
    }
  }

  // Link recipients to platform accounts where possible
  const matrixIds = [...new Set(recipients.map((r) => r.matrixId).filter(Boolean))] as string[];
  const emails = [...new Set(recipients.map((r) => r.email).filter(Boolean))] as string[];
  const accounts =
    matrixIds.length || emails.length
      ? await db
          .select({ id: users.id, email: users.email })
          .from(users)
          .where(
            or(
              matrixIds.length ? inArray(users.id, matrixIds) : undefined,
              emails.length ? inArray(sql`lower(${users.email})`, emails) : undefined,
            ),
          )
      : [];
  const accountById = new Set(accounts.map((a) => a.id));
  const accountByEmail = new Map(accounts.map((a) => [a.email.toLowerCase(), a.id]));

  const resultCodes: string[] = [];
  const toInsert: (typeof certificates.$inferInsert)[] = [];
  const toRestore: number[] = [];
  const seen = new Set<string>();

  for (const r of recipients) {
    const keys = identityKeys(r);
    if (keys.some((k) => seen.has(k))) continue; // duplicate row in this batch
    keys.forEach((k) => seen.add(k));

    const match = keys.map((k) => byKey.get(k)).find(Boolean);
    if (match) {
      if (match.revokedAt) toRestore.push(match.id);
      resultCodes.push(match.code);
      continue;
    }
    const code = newCode(eventId);
    resultCodes.push(code);
    toInsert.push({
      code,
      eventId,
      recipientName: r.name,
      recipientEmail: r.email,
      matrixId: r.matrixId,
      userId: (r.matrixId && accountById.has(r.matrixId) ? r.matrixId : null) ?? (r.email ? accountByEmail.get(r.email) : null) ?? null,
      source: r.source,
      issuedBy: issuerId,
    });
  }

  await db.transaction(async (tx) => {
    if (toInsert.length) await tx.insert(certificates).values(toInsert);
    if (toRestore.length) {
      await tx.update(certificates).set({ revokedAt: null }).where(inArray(certificates.id, toRestore));
    }
  });

  const issued = await db
    .select()
    .from(certificates)
    .where(inArray(certificates.code, resultCodes))
    .orderBy(asc(certificates.recipientName));
  return { created: toInsert.length, restored: toRestore.length, certificates: issued };
};

export const listCertificates = (eventId: number) =>
  db.select().from(certificates).where(eq(certificates.eventId, eventId)).orderBy(asc(certificates.recipientName));

export const setCertificateRevoked = async (eventId: number, code: string, revoked: boolean) => {
  const [cert] = await db
    .update(certificates)
    .set({ revokedAt: revoked ? new Date() : null })
    .where(and(eq(certificates.eventId, eventId), eq(certificates.code, code)))
    .returning();
  if (!cert) throw new HTTPException(404, { message: 'Certificate not found' });
  return cert;
};

/**
 * Record that certificates were emailed. The emails themselves go out from the
 * issuer's own Gmail in the browser (Gmail API), so the API only keeps track.
 */
export const markCertificatesEmailed = async (eventId: number, codes: unknown) => {
  if (!Array.isArray(codes) || codes.length === 0) {
    throw new HTTPException(400, { message: 'codes must be a non-empty array' });
  }
  if (codes.length > MAX_MARK_EMAILED) {
    throw new HTTPException(400, { message: `Mark at most ${MAX_MARK_EMAILED} certificates at a time` });
  }
  await getCertificateEvent(eventId);
  const updated = await db
    .update(certificates)
    .set({ emailedAt: new Date() })
    .where(and(eq(certificates.eventId, eventId), inArray(certificates.code, codes.map(String)), isNull(certificates.revokedAt)))
    .returning({ code: certificates.code, emailedAt: certificates.emailedAt });
  return { updated };
};

// ─── Public ───

/** Public verification: everything needed to show and download the certificate */
export const verifyCertificate = async (code: string) => {
  const [row] = await db
    .select({
      code: certificates.code,
      recipientName: certificates.recipientName,
      matrixId: certificates.matrixId,
      issuedAt: certificates.issuedAt,
      revokedAt: certificates.revokedAt,
      event: {
        id: events.id,
        title: events.title,
        slug: events.slug,
        eventDate: events.eventDate,
        venue: events.venue,
      },
      template: {
        backgroundUrl: certificateTemplates.backgroundUrl,
        width: certificateTemplates.width,
        height: certificateTemplates.height,
        fields: certificateTemplates.fields,
      },
    })
    .from(certificates)
    .innerJoin(events, eq(events.id, certificates.eventId))
    .leftJoin(certificateTemplates, eq(certificateTemplates.eventId, certificates.eventId))
    .where(eq(certificates.code, code.trim().toUpperCase()));
  if (!row) throw new HTTPException(404, { message: 'No certificate with this code exists' });
  return { ...row, valid: !row.revokedAt };
};

/** Certificates belonging to the signed-in member */
export const getMyCertificates = async (user: { id: string }) => {
  const [account] = await db.select({ email: users.email }).from(users).where(eq(users.id, user.id));
  const email = account?.email?.toLowerCase();
  return db
    .select({
      code: certificates.code,
      recipientName: certificates.recipientName,
      issuedAt: certificates.issuedAt,
      event: { id: events.id, title: events.title, slug: events.slug, eventDate: events.eventDate },
    })
    .from(certificates)
    .innerJoin(events, eq(events.id, certificates.eventId))
    .where(
      and(
        isNull(certificates.revokedAt),
        or(
          eq(certificates.userId, user.id),
          eq(certificates.matrixId, user.id.toUpperCase()),
          email ? eq(sql`lower(${certificates.recipientEmail})`, email) : undefined,
        ),
      ),
    )
    .orderBy(desc(certificates.issuedAt));
};
