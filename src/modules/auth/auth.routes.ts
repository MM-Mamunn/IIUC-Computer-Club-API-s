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

const router = new Hono();
// console.log("in auth routes ");

router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', forgotPass);
router.post('/reset-password', resetPass);
router.post('/uploadimg-public', uploadImagePublic);
router.post('/uploadimg', authMiddleware, uploadImage);
router.get('/me', authMiddleware, me);

router.put('/update', authMiddleware, updateUserController);

router.put('/change-password', authMiddleware, changePass);

router.get('/refresh-token', authMiddleware, refresh);

export default router;
