import { db } from '../../config/db';
import { executives, users } from '../../db/schema';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { hashPassword, comparePassword } from '../../utils/hash';
import { generateToken } from '../../utils/jwt';
import { HTTPException } from 'hono/http-exception';
import type { Context } from 'hono';
import { showActive } from '../committee/committee.service';

export const registerUser = async (
  id: string,
  name: string,
  email: string,
  password: string,
  gender: string,
) => {
  console.log(id, name, email, gender, password);

  if (gender !== 'male' && gender !== 'female') {
    throw new HTTPException(400, { message: "Invalid gender. Please specify 'male' or 'female'" });
  }
  const existing = await db
    .select()
    .from(users)
    .where(eq(sql`upper(${users.id})`, id.toUpperCase()));

  if (existing.length > 0) {
    throw new HTTPException(409, { message: `user ${id} already exists` });
  }

  if (password.length < 6) {
    throw new HTTPException(400, { message: 'Password must be at least 6 characters' });
  }

  const hashed = await hashPassword(password);

  const [newUser] = await db
    .insert(users)
    .values({ id, name: name, email: email, password: hashed, gender: gender })
    .returning();

  if (!newUser) {
    throw new HTTPException(401, { message: 'Failed to create user' });
  }
  const token = await loginUser(id, password);
  // return newUser;
  return { token };
};
export const loginUser = async (id: string, password: string) => {
  const [user] = await db.select().from(users).where(eq(users.id, id));

  if (!user) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  const valid = await comparePassword(password, user.password);

  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  const active = await showActive();
  const activeNumbers = active.map((a) => a.number);

  const [pos] = await db
    .select()
    .from(executives)
    .where(and(eq(executives.id, id), inArray(executives.number, activeNumbers)));
  const token = generateToken({
    id: user.id,
    role: pos?.role ?? 'student',
    position: pos?.position ?? '',
    mustChangePassword: user.mustChangePassword ?? false,
  });

  return { token };
};

/**
 * Re-issue a JWT with the user's current role/position from the DB.
 * Called by authenticated users to pick up role changes without re-login.
 */
export const refreshToken = async (c: Context) => {
  const currentUser = c.get('user');
  const [user] = await db.select().from(users).where(eq(users.id, currentUser.id));

  if (!user) {
    throw new HTTPException(401, { message: 'User not found' });
  }

  const active = await showActive();
  const activeNumbers = active.map((a) => a.number);

  const [pos] = activeNumbers.length
    ? await db
        .select()
        .from(executives)
        .where(and(eq(executives.id, user.id), inArray(executives.number, activeNumbers)))
    : [];

  const token = generateToken({
    id: user.id,
    role: pos?.role ?? 'student',
    position: pos?.position ?? '',
    mustChangePassword: user.mustChangePassword ?? false,
  });

  return { token };
};

export const saveImage = async (imageUrl: string, c: Context) => {
  const user = c.get('user');
  const userId = user.id;
  if (!userId) {
    throw new HTTPException(400, { message: 'User ID required' });
  }

  const [updatedUser] = await db
    .update(users)
    .set({ profileImage: imageUrl })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }
  return {
    profileImage: updatedUser.profileImage,
  };
};

export const showMe = async (c: Context) => {
  const user = c.get('user');
  const userId = user.id;
  if (!userId) {
    throw new HTTPException(400, { message: 'User ID required' });
  }

  const [me] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      gender: users.gender,
      profileImage: users.profileImage,
      description: users.description,
      createdat: users.createdAt,
    })
    .from(users)
    .where(eq(users.id, user.id));

  if (!me) {
    throw new HTTPException(404, { message: 'User not found' });
  }
  return me;
};

type UpdateUserInput = {
  id?: string;
  name?: string;
  email?: string;
  gender?: string;
  profileImage?: string;
  description?: string;
};

export const updateUser = async (data: UpdateUserInput, c: Context) => {
  const { ...fields } = data;
  const user = c.get('user');
  if (!user.id) {
    throw new HTTPException(400, { message: 'User id is required' });
  }

  // remove undefined fields
  const updateData = Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined));

  if (Object.keys(updateData).length === 0) {
    throw new HTTPException(400, { message: 'No fields provided for update' });
  }
  if (updateData.password) {
    throw new HTTPException(400, { message: "Can't change password through this endpoint" });
  }
  const [updatedUser] = await db
    .update(users)
    .set(updateData)
    .where(eq(users.id, user.id))
    .returning({
      id: users.id,
      name: users.name,
      gender: users.gender,
      email: users.email,
      description: users.description,
      profileImage: users.profileImage,
      createdAt: users.createdAt,
    });
  if (!updatedUser) {
    throw new HTTPException(404, { message: 'User not found' });
  }

  return updatedUser;
};

// FUNCTIONS TO ADD VICE PRESIDENT
export const changePassword = async (currentPassword: string, newPassword: string, c: Context) => {
  const user = c.get('user');
  const [use] = await db.select().from(users).where(eq(users.id, user.id));

  if (!use) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  const valid = await comparePassword(currentPassword, use.password);

  if (!valid) {
    throw new HTTPException(401, { message: 'Invalid credentials' });
  }

  if (newPassword.length < 6) {
    throw new HTTPException(400, { message: 'New Password must be at least 6 characters' });
  }

  const hashed = await hashPassword(newPassword);

  const [updatedUser] = await db
    .update(users)
    .set({
      password: hashed,
      mustChangePassword: false,
    })
    .where(eq(users.id, use.id))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
    });

  if (!updatedUser) {
    throw new HTTPException(401, { message: 'Failed to create user' });
  }
  const token = await loginUser(use.id, newPassword);
  // return newUser;
  return { token };
};
