import { Context, Next } from "hono";

export const requireRole = (role: string) => {
   console.log("role  in");
  return async (c: Context, next: Next) => {
    const user = c.get("user");

    if (!user || user.role !== role) {
      return c.json({ message: "Forbidden" }, 403);
    }

    await next();
  };
};
