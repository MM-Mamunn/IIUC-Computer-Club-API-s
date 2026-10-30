import { Hono } from 'hono';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/role.middleware';
import { getRolesByPriorityRange } from '../global/global.service';
import {
  workspace,
  saveTemplate,
  uploadSignature,
  registeredRecipients,
  importGoogleSheet,
  issue,
  list,
  revoke,
  markEmailed,
  verify,
  mine,
} from './certificate.controller';

const router = new Hono();

// ─── Public ───
router.get('/verify/:code', verify);

// ─── Signed-in member ───
router.get('/me', authMiddleware, mine);

// ─── Certificate tool: president down to secretary (role priority 1–5) ───
const managers = requireRole(await getRolesByPriorityRange(1, 5));

router.get('/upload-signature', authMiddleware, managers, uploadSignature);
router.post('/import/google-sheet', authMiddleware, managers, importGoogleSheet);
router.get('/events/:eventId', authMiddleware, managers, workspace);
router.put('/events/:eventId/template', authMiddleware, managers, saveTemplate);
router.get('/events/:eventId/recipients', authMiddleware, managers, registeredRecipients);
router.get('/events/:eventId/certificates', authMiddleware, managers, list);
router.post('/events/:eventId/certificates', authMiddleware, managers, issue);
// Emails are sent from the issuer's Gmail in the browser; this records which went out
router.post('/events/:eventId/certificates/emailed', authMiddleware, managers, markEmailed);
router.put('/events/:eventId/certificates/:code/revoke', authMiddleware, managers, revoke);

export default router;
