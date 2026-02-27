import { db } from "../../config/db";
import { roles } from "../../db/schema";
import { and, gte, lte, asc } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";

export const getRolesByPriorityRange = async (
  from: number,
  to: number,
): Promise<string[]> => {
  if (from > to) {
    throw new HTTPException(400, {
      message: "'from' must be less than or equal to 'to'",
    });
  }

  const result = await db
    .select({ role: roles.role })
    .from(roles)
    .where(and(gte(roles.priority, from), lte(roles.priority, to)))
    .orderBy(asc(roles.priority)); // optional but recommended

  // Return only role names as string[]
  return result.map((r) => r.role);
};
