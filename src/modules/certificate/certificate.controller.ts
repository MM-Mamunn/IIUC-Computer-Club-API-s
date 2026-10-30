import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  getCertificateWorkspace,
  saveCertificateTemplate,
  getBackgroundUploadSignature,
  getRegisteredRecipients,
  fetchGoogleSheetCsv,
  issueCertificates,
  listCertificates,
  setCertificateRevoked,
  markCertificatesEmailed,
  verifyCertificate,
  getMyCertificates,
} from './certificate.service';
import { cdnCache } from '../../utils/cache';

const eventIdParam = (c: Context) => {
  const id = Number(c.req.param('eventId'));
  if (!Number.isInteger(id) || id <= 0) throw new HTTPException(400, { message: 'Invalid event ID' });
  return id;
};

export const workspace = async (c: Context) => c.json(await getCertificateWorkspace(eventIdParam(c)), 200);

export const saveTemplate = async (c: Context) => {
  const body = await c.req.json();
  const template = await saveCertificateTemplate(eventIdParam(c), body, c.get('user').id);
  return c.json({ template }, 200);
};

export const uploadSignature = async (c: Context) => c.json(getBackgroundUploadSignature(), 200);

export const registeredRecipients = async (c: Context) =>
  c.json({ recipients: await getRegisteredRecipients(eventIdParam(c)) }, 200);

export const importGoogleSheet = async (c: Context) => {
  const { url } = await c.req.json();
  return c.json({ csv: await fetchGoogleSheetCsv(url) }, 200);
};

export const issue = async (c: Context) => {
  const { recipients } = await c.req.json();
  return c.json(await issueCertificates(eventIdParam(c), recipients, c.get('user').id), 201);
};

export const list = async (c: Context) => c.json({ certificates: await listCertificates(eventIdParam(c)) }, 200);

export const revoke = async (c: Context) => {
  const { revoked } = await c.req.json().catch(() => ({ revoked: true }));
  const certificate = await setCertificateRevoked(eventIdParam(c), c.req.param('code'), revoked !== false);
  return c.json({ certificate }, 200);
};

export const markEmailed = async (c: Context) => {
  const { codes } = await c.req.json().catch(() => ({}));
  return c.json(await markCertificatesEmailed(eventIdParam(c), codes), 200);
};

export const verify = async (c: Context) => {
  const certificate = await verifyCertificate(c.req.param('code'));
  // Short CDN copy so a revocation shows up within a minute
  cdnCache(c, 60);
  return c.json({ certificate }, 200);
};

export const mine = async (c: Context) => c.json({ certificates: await getMyCertificates(c.get('user')) }, 200);
