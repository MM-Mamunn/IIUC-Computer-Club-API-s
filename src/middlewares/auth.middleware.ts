import type { Context, Next } from "hono";
import { verifyToken } from "../utils/jwt";

export const authMiddleware = async (c: Context, next: Next) => {
  console.log("auth in");

  const authHeader = c.req.header("Authorization");

  if (!authHeader) return c.json({ message: "Unauthorized" }, 401);

  const token = authHeader.split(" ")[1];

  try {
    const decoded = verifyToken(token);
    c.set("user", decoded);
    await next();
  } catch {
    return c.json({ message: "Invalid token" }, 401);
  }
};
