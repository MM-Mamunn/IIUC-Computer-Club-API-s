import type { Context, Next } from "hono";
import { verifyToken } from "../utils/jwt";

export const authMiddleware = async (c: Context, next: Next) => {

  const authHeader = c.req.header("Authorization");

  if (!authHeader) {
    return c.json({ message: "Please sign in to continue" }, 401);
  }

  const parts = authHeader.split(" ");

  if (parts.length !== 2) {
    return c.json({ message: "Authentication failed. Please sign in again" }, 401);
  }

  const scheme = parts[0];
  const token = parts[1];

  // Extra safety check (satisfies TypeScript)
  if (!scheme || !token) {
    return c.json({ message: "Authentication failed. Please sign in again" }, 401);
  }

  if (scheme.toLowerCase() !== "bearer") {
    return c.json({ message: "Authentication failed. Please sign in again" }, 401);
  }

  try {
    const decoded = verifyToken(token);
    c.set("user", decoded);
    await next();
  } catch (err) {
    return c.json({ message: "Your session has expired. Please sign in again" }, 401);
  }
};

export const optionalAuthMiddleware = async (c: Context, next: Next) => {
  const authHeader = c.req.header("Authorization");
  if (!authHeader) {
    return next();
  }

  const parts = authHeader.split(" ");
  if (parts.length === 2 && parts[0].toLowerCase() === "bearer") {
    try {
      const decoded = verifyToken(parts[1]);
      c.set("user", decoded);
    } catch {
      // Ignore invalid token for optional auth
    }
  }

  return next();
};

