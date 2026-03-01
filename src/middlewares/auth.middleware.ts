import type { Context, Next } from "hono";
import { verifyToken } from "../utils/jwt";

export const authMiddleware = async (c: Context, next: Next) => {

  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({ message: "Unauthorized" }, 401);
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    return c.json({ message: "Invalid Authorization header format" }, 401);
  }

  const scheme = parts[0];
  const token = parts[1];

  // Extra safety check (satisfies TypeScript)
  if (!scheme || !token) {
    return c.json({ message: "Invalid Authorization header format" }, 401);
  }

  if (scheme.toLowerCase() !== "bearer") {
    return c.json({ message: "Invalid Authorization scheme" }, 401);
  }

  try {
    const decoded = verifyToken(token);
    c.set("user", decoded);
    await next();
  } catch (err) {
    console.error("Invalid token:", err);
    return c.json({ message: "Invalid token" }, 401);
  }
};

