import type { Context, Next } from "hono";

export const requireRole = (roles: string[]) => {
  return async (c: Context, next: Next) => {
   
    
    const user = c.get("user");
    console.log(user.role);
    
    if (!user || !roles.includes(user.role)) {
      return c.json({ message: "Forbidden" }, 403);
    }

    await next();
  };
};