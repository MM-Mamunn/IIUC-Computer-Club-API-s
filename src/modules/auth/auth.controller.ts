import type { Context } from 'hono';
import {
  registerUser,
  loginUser,
  saveImage,
  showMe,
  updateUser,
  changePassword,
  refreshToken,
} from './auth.service';
import { uploadImageToCloudinary } from '../../utils/uploadImage';

export const register = async (c: Context) => {
  const {
    id: id,
    name: name,
    email: email,
    password: password,
    gender: gender,
  } = await c.req.json();

  const user = await registerUser(id, name, email, password, gender);

  return c.json({ token: user.token.token }, 201);
};
export const login = async (c: Context) => {
  console.log('in controller log in');

  const { id, password } = await c.req.json();
  const result = await loginUser(id, password);
  return c.json(result);
};

export const uploadImage = async (c: Context) => {
  // Parse multipart form data
  const body = await c.req.parseBody();

  const file = body.image as File;

  if (!file) {
    return c.json({ message: 'Image file is required' }, 400);
  }

  try {
    const imageUrl = await uploadImageToCloudinary(file);

    const url = await saveImage(imageUrl, c);
    return c.json(url);
  } catch (error) {
    console.error('Upload error:', error);
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

  return c.json(
    {
      success: true,
      message: 'Profile updated',
      user,
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
