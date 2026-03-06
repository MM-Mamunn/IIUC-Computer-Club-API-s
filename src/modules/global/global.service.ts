import { db } from "../../config/db";
import { committee, roles, users } from "../../db/schema";
import { and, gte, lte, asc, eq } from "drizzle-orm";
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

export const genderMatch = async (id: string, number: string) => {
  // 🔹 Get user gender
  const [user] = await db
    .select({ gender: users.gender })
    .from(users)
    .where(eq(users.id, id));

  if (!user) {
    throw new HTTPException(404, {
      message: "User not found",
    });
  }

  // 🔹 Get committee gender
  const [comm] = await db
    .select({ gender: committee.gender })
    .from(committee)
    .where(eq(committee.number, number));

  if (!comm) {
    throw new HTTPException(404, {
      message: "Committee not found",
    });
  }

  // 🔹 Compare genders
  if (user.gender !== comm.gender) {
    throw new HTTPException(403, {
      message: `This committee is only for ${comm.gender} members/ Gender doesn't match user's gender`,
    });
  }
 
  return true;
};
