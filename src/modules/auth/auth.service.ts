import { db } from "../../config/db";
import { users } from "../../db/schema";
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

  // console.log(id.toUpperCase());
  
  const user = await db.select().from(users).where(eq(users.id, id ));
  
  if (!user.length) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const valid = await comparePassword(password, user[0].password);

  if (!valid) {
    throw new HTTPException(401, { message: "Invalid credentials" });
  }

  const token = generateToken({
    id: user[0].id,
    role: user[0].role,
    position: user[0].position
  });

  return { token };
};