import { asc, desc } from 'drizzle-orm';
import { db } from '../../config/db';
import { positions, roles } from '../../db/schema';
import { cached } from '../../utils/cache';

export const showPositions = () =>
  cached('general:positions', 10 * 60_000, async () => {
    return db.select().from(positions);
  });

export const showRoles = () =>
  cached('general:roles', 10 * 60_000, async () => {
    return db
      .select({ role: roles.role, description: roles.description })
      .from(roles)
      .orderBy(asc(roles.priority), asc(roles.role));
  });
