
import { asc, desc } from "drizzle-orm";
import { db } from "../../config/db";
import {  positions,  roles } from "../../db/schema";

export const showPositions = async () => {
  
  const poss = await db
    .select()
    .from(positions)
  console.log(poss);
  
  return poss;
};
export const showRoles = async () => {
  
const result = await db
  .select({role: roles.role, description: roles.description})
  .from(roles)
  .orderBy(
    asc(roles.priority),
    asc(roles.role)
  );
  return result;
};
