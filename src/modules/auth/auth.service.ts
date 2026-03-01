import { db } from "../../config/db";
import { executives, positions, users } from "../../db/schema";
import { eq,sql } from "drizzle-orm";
import { hashPassword, comparePassword } from "../../utils/hash";
import { generateToken } from "../../utils/jwt";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";

export const registerUser = async (id: string,name: string, email: string, password: string) => {
 console.log("auth service registerUser");
 
  const existing = await db.select().from(users).where(eq(sql`upper(${users.id})`, id.toUpperCase()));

  if (existing.length > 0) {
    throw new HTTPException(409, { message: `user ${id} already exists` });
  }

  const hashed = await hashPassword(password);
  console.log(id,name, email, hashed);
  
  const [newUser] = await db.insert(users)
    .values({id: id, name: name, email : email, password: hashed  })
    .returning();

     if (!newUser) {
    throw new HTTPException(401, { message: "Failed to create user" });
  }
  const token = await loginUser(id, password);
  // return newUser;
  return { token };
};
export const loginUser = async (id: string, password: string) => {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, id));

  if (!user) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const valid = await comparePassword(password, user.password);

  if (!valid) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const [pos] = await db
    .select()
    .from(executives)
    .where(eq(executives.id, id));

  const token = generateToken({
    id: user.id,
    role: pos?.role ?? "",
    position: pos?.position ?? "",
  });

  return { token };
};



export const saveImage = async (
  imageUrl: string,
  c: Context
) => {
  const user = c.get("user");
  const userId = user.id;
  if (!userId) {
    throw new HTTPException(400, { message: "User ID required" });
  }

  const [updatedUser] = await db
    .update(users)
    .set({ profileImage: imageUrl })
    .where(eq(users.id, userId))
    .returning();

  if (!updatedUser) {
    throw new HTTPException(404, { message: "User not found" });
  }
return {
  profileImage: updatedUser.profileImage
};
};