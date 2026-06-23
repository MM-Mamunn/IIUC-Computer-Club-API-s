import type { Context, Next } from "hono";
import { isEventManager } from "../modules/event/event.service";

export const requireRole = (roles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    
    if (!user || !roles.includes(user.role)) {
      return c.json({ message: "You don't have permission to perform this action" }, 403);
    }

    await next();
  };
};

export const requireAdminOrEventManager = (roles: string[]) => {
  return async (c: Context, next: Next) => {
    const user = c.get("user");
    if (!user) {
      return c.json({ message: "You don't have permission to perform this action" }, 403);
    }

    // If user's role satisfies the admin/exec requirement, proceed
    if (roles.includes(user.role)) {
      return await next();
    }

    // Otherwise, check if they are an event manager for the specific event ID
    const eventIdParam = c.req.param("id");
    if (eventIdParam) {
      const eventId = parseInt(eventIdParam);
      if (!isNaN(eventId)) {
        const allowed = await isEventManager(eventId, user.id);
        if (allowed) {
          return await next();
        }
      }
    }

    return c.json({ message: "You don't have permission to perform this action" }, 403);
  };
};