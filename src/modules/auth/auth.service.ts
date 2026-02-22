import { db } from "../../config/db";
import { executives, positions, users } from "../../db/schema";
import { eq,sql } from "drizzle-orm";
import { hashPassword, comparePassword } from "../../utils/hash";
import { generateToken } from "../../utils/jwt";
import { HTTPException } from "hono/http-exception";

export const registerUser = async (id: string,name: string, email: string, password: string) => {
 console.log("auth service registerUser");
 
  const existing = await db.select().from(users).where(eq(sql`upper(${users.id})`, id.toUpperCase()));

  if (existing.length > 0) {
    throw new HTTPException(409, { message: "ID already exists" });
  }

  const hashed = await hashPassword(password);
  console.log(id,name, email, hashed);
  
  const [newUser] = await db.insert(users)
    .values({id: id, name: name, email : email, password: hashed  })
    .returning();

  return newUser;
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
    role: pos?.role ?? "member",
    position: pos?.position ?? "member",
  });

  return { token };
};