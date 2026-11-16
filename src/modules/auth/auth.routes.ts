import { Hono } from 'hono';
import {
  register,
  login,
  uploadImage,
  uploadImagePublic,
  me,
  updateUserController,
  changePass,
  refresh,
  forgotPass,
  resetPass,
} from './auth.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import {
  rateLimiter,
  rateLimits,
  bodyField,
  type RateLimitOptions,
} from '../../middlewares/rate-limit.middleware';

const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

// Per-IP limits are generous because a whole campus can share one IP; the
// per-account limits are what actually stop password guessing.
const loginIpLimit: RateLimitOptions = {
  keyPrefix: 'login-ip',
  windowMs: 15 * MINUTE,
  max: 100,
  message: 'Too many login attempts',
};
const loginAccountLimit: RateLimitOptions = {
  keyPrefix: 'login-id',
  windowMs: 15 * MINUTE,
  max: 10,
  by: bodyField('id'),
  message: 'Too many login attempts for this account',
};
const forgotIpLimit: RateLimitOptions = {
  keyPrefix: 'forgot-ip',
  windowMs: HOUR,
  max: 20,
  message: 'Too many reset requests',
};
const forgotEmailLimit: RateLimitOptions = {
  keyPrefix: 'forgot-email',
  windowMs: HOUR,
  max: 3,
  by: bodyField('email'),
  message: 'Too many reset requests for this email',
};

const router = new Hono();
// console.log("in auth routes ");

router.post('/register', rateLimiter({ keyPrefix: 'register-ip', windowMs: HOUR, max: 60 }), register);
router.post('/login', rateLimits(loginIpLimit, loginAccountLimit), login);
router.post('/forgot-password', rateLimits(forgotIpLimit, forgotEmailLimit), forgotPass);
router.post('/reset-password', rateLimiter({ keyPrefix: 'reset-ip', windowMs: 15 * MINUTE, max: 20 }), resetPass);
router.post('/uploadimg-public', rateLimiter({ keyPrefix: 'upload-public-ip', windowMs: HOUR, max: 30, message: 'Too many uploads' }), uploadImagePublic);
router.post('/uploadimg', authMiddleware, uploadImage);
router.get('/me', authMiddleware, me);

router.put('/update', authMiddleware, updateUserController);

router.put(
  '/change-password',
  authMiddleware,
  rateLimiter({ keyPrefix: 'change-pw', windowMs: 15 * MINUTE, max: 10, by: (c) => c.get('user')?.id }),
  changePass,
);

router.get('/refresh-token', authMiddleware, refresh);

export default router;
