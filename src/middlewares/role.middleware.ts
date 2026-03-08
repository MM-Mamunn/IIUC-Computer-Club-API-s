import type { Context, Next } from "hono";

export const requireRole = (roles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    
    if (!user || !roles.includes(user.role)) {
      return c.json({ message: "You don't have permission to perform this action" }, 403);
    }

    await next();
  };
};