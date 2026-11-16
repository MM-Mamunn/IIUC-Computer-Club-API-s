import type { Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import {
  registerUser,
  loginUser,
  saveImage,
  showMe,
  updateUser,
  changePassword,
  refreshToken,
  forgotPassword,
  resetPassword,
} from './auth.service';
import { uploadImageToCloudinary, PROFILE_PHOTO_UPLOAD } from '../../utils/uploadImage';

export const register = async (c: Context) => {
  const {
    id,
    name,
    email,
    password,
    gender,
    idCard,
    department,
    profileImage,
    description,
    githubUrl,
    linkedinUrl,
    facebookUrl,
    twitterUrl,
    batch,
    skills,
    designation,
    committeeNumber,
    session,
  } = await c.req.json();

  const user = await registerUser(
    id,
    name,
    email,
    password,
    gender,
    idCard,
    department,
    profileImage,
    description,
    githubUrl,
    linkedinUrl,
    facebookUrl,
    twitterUrl,
    batch,
    skills,
    designation,
    committeeNumber,
    session,
  );

  return c.json({ token: user.token.token }, 201);
};
export const login = async (c: Context) => {
  const { id, password } = await c.req.json();
  const result = await loginUser(id, password);
  return c.json(result);
};

export const uploadImagePublic = async (c: Context) => {
  const contentType = c.req.header('content-type') ?? '';

  if (!contentType.includes('multipart/form-data')) {
    return c.json({ message: 'Content-Type must be multipart/form-data' }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get('image');

  if (!(file instanceof File) || file.size === 0) {
    return c.json({ message: 'Image file is required' }, 400);
  }

  try {
    const imageUrl = await uploadImageToCloudinary(file);
    return c.json({ imageUrl }, 200);
  } catch (error) {
    // Our own checks (e.g. file type) have a clear message for the user
    if (error instanceof HTTPException) {
      return c.json({ message: error.message }, error.status);
    }
    // Anything else stays in the server log; Cloudinary's raw errors aren't for clients
    console.error('Upload error:', error instanceof Error ? error.message : error);
    return c.json({ message: 'Image upload failed' }, 500);
  }
};

export const uploadImage = async (c: Context) => {
  const contentType = c.req.header('content-type') ?? '';

  if (!contentType.includes('multipart/form-data')) {
    return c.json({ message: 'Content-Type must be multipart/form-data' }, 400);
  }

  const formData = await c.req.formData();
  const file = formData.get('image');

  if (!(file instanceof File) || file.size === 0) {
    return c.json({ message: 'Image file is required' }, 400);
  }

  try {
    const imageUrl = await uploadImageToCloudinary(file, PROFILE_PHOTO_UPLOAD);

    const url = await saveImage(imageUrl, c);
    return c.json(url);
  } catch (error) {
    if (error instanceof HTTPException) {
      return c.json({ message: error.message }, error.status);
    }

    console.error('Upload error:', error instanceof Error ? error.message : error);
    return c.json({ message: 'Image upload failed' }, 500);
  }
};

export const me = async (c: Context) => {
  const me = await showMe(c);
  return c.json({ me }, 200);
};

export const updateUserController = async (c: Context) => {
  const body = await c.req.json();

  const user = await updateUser(body, c);

  const designationPending = Boolean((user as any).designationPending);
  const designationLocked = Boolean((user as any).designationLocked);
  return c.json(
    {
      success: true,
      message: designationPending
        ? 'Profile updated. A different role is assigned by the committee (Add Role), so your designation was not changed.'
        : designationLocked
          ? 'Profile updated. Only current committee members can set a designation, so it was not changed.'
          : 'Profile updated',
      designationPending,
      designationLocked,
      user,
      token: (user as any).token,
    },
    200,
  );
};

export const changePass = async (c: Context) => {
  const { oldPassword, newPassword } = await c.req.json();
  const updated = await changePassword(oldPassword, newPassword, c);
  return c.json({ token: updated.token.token }, 200);
};

export const refresh = async (c: Context) => {
  const result = await refreshToken(c);
  return c.json(result);
};

export const forgotPass = async (c: Context) => {
  const { email, frontendUrl } = await c.req.json();
  const result = await forgotPassword(email, frontendUrl || '');
  return c.json(result);
};

export const resetPass = async (c: Context) => {
  const { token, newPassword } = await c.req.json();
  const result = await resetPassword(token, newPassword);
  return c.json(result);
};
