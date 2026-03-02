
import { db } from "../../config/db";
import {  positions } from "../../db/schema";

export const showPositions = async () => {
  
  const poss = await db
    .select()
    .from(positions)
  console.log(poss);
  
  return poss;
};
