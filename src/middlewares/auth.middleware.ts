import type { Context, Next } from "hono";
import { verifyToken } from "../utils/jwt";

/** A login token has a user id and no special `purpose` (reset, fix-payment, ...) */
const isSessionToken = (decoded: unknown): boolean =>
  typeof decoded === "object" &&
  decoded !== null &&
  typeof (decoded as { id?: unknown }).id === "string" &&
  (decoded as { purpose?: unknown }).purpose === undefined;

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

  let decoded;
  try {
    decoded = verifyToken(token);
  } catch (err) {
    return c.json({ message: "Your session has expired. Please sign in again" }, 401);
  }

  // Reset and fix-payment links are signed with the same secret; they must not work as logins
  if (!isSessionToken(decoded)) {
    return c.json({ message: "Authentication failed. Please sign in again" }, 401);
  }

  c.set("user", decoded);
  await next();
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
      if (isSessionToken(decoded)) c.set("user", decoded);
    } catch {
      // Ignore invalid token for optional auth
    }
  }

  return next();
};

