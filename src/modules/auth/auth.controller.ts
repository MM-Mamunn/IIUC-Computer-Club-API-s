import type { Context } from "hono";
import { registerUser, loginUser } from "./auth.service";

export const register = async (c: Context) => {
  
console.log("in auth controller register function");

  const { id,name, email, password } = await c.req.json();
 console.log(id,name,email,password);
 
  // if (!["teacher", "student"].includes(role)) {
  //   return c.json({ message: "Invalid role" }, 400);
  // }

  const user = await registerUser(id, name, email, password);
  return c.json({ user }, 201);
};

export const login = async (c: Context) => {
  console.log("in controller log in");
  
  const { id, password } = await c.req.json();
  const result = await loginUser(id, password);
  return c.json(result);
};
