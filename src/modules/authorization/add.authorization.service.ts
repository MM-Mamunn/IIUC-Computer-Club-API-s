import { db } from "../../config/db";
import { executives, users } from "../../db/schema";
import { eq,and, or } from "drizzle-orm";
import { hashPassword, comparePassword } from "../../utils/hash";
import { generateToken } from "../../utils/jwt";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";


// FUNCTIONS TO ADD VICE PRESIDENT
export const addVicePresident = async (id: string,role: string,committee: string,c: Context) => {
  
     const user = c.get("user");

   console.log("role is",role);
   
  if(role !== "vice president 1" && role !== "vice president 2" &&  role !== "vice president 3"){
    throw new HTTPException(400, { message: `Invalid role ${role}. Must be vice president 1, 2, or 3` });
  }

 const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.committee, committee),
      eq(executives.role, role)
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Role ${role} already exists in committee ${committee}` });
  }
  // const [newVP] = await db.insert(executives)
  //   .values({id,position: 'vice president',role, committee, assignedBy: user.id })
  //   .returning();
  const [newVP] = 
  await db
  .insert(executives)
  .values({
    id,
    committee,
    role,
    position: "vice president",
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.committee],
    set: {
      role,
      position: "vice president",
      assignedBy: user.id,
    },
  })
  .returning();
  return newVP;
};

// FUNCTION TO ADD TREASURER
export const addTreasurer = async (id: string,committee: string,c: Context) => {
const user = c.get("user");   
const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.committee, committee),
      eq(executives.role, "treasurer")
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Treasurer already exists in committee ${committee}` });
  }
  
  const [newTrsr] =
  await db
  .insert(executives)
  .values({
    id,
    role: "treasurer",
    position: "treasurer",
    committee,
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.committee],
    set: {
      role : "treasurer",
      position: "treasurer",
      assignedBy: user.id,
    },
  })
  .returning();
  return newTrsr;
};

// FUNCTION TO ADD GENERAL SECRETARY
export const addGeneralSecretary = async (id: string,committee: string,c: Context) => {
const user = c.get("user");   
const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.committee, committee),
      eq(executives.role, "general secretary")
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `General Secretary already exists in committee ${committee}` });
  }
  
  const [newGS] =
  await db
  .insert(executives)
  .values({
    id,
    role: "general secretary",
    position: "general secretary",
    committee,
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.committee],
    set: {
      role : "general secretary",
      position: "general secretary",
      assignedBy: user.id,
    },
  })
  .returning();
  return newGS;
};

// FUNCTION TO ADD ASSISTANT GENERAL SECRETARY
export const addAsstGeneralSecretary = async (id: string,role: string,committee: string,c: Context) => {
  
     const user = c.get("user");

  if(role !== "assistant general secretary 1" && role !== "assistant general secretary 2" &&  role !== "assistant general secretary 3"){
    throw new HTTPException(400, { message: `Invalid role ${role}. Must be assistant general secretary 1, 2, or 3` });
  }

 const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.committee, committee),
      eq(executives.role, role)
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Role ${role} already exists in committee ${committee}` });
  }
 const [newAGS] = await db
  .insert(executives)
  .values({
    id,
    committee,
    role,
    position: "assistant general secretary",
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.committee],
    set: {
      role,
      position: "assistant general secretary",
      assignedBy: user.id,
    },
  })
  .returning();

  return newAGS;
};


export const addSecretaries = async (id: string,position : string, role: string,committee: string,c: Context) => {
  
     const user = c.get("user");
   
  if(role !== "secretary" && role !== "assistant secretary" ){
    throw new HTTPException(400, { message: `Invalid role ${role}. Must be secretary, assistant secretary` });
  }
  
  if(position == "president" || position == "general secretary" || position == "assistant general secretary" || position == "vice president" ){
    throw new HTTPException(400, { message: `Invalid position ${position}. Secretaries and assistant secretaries can't be in this position` });
  }
  
 const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.committee, committee),
      eq(executives.role, role),
      eq(executives.position, position)
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Role ${role} in position ${position} already exists in committee ${committee}` });
  }


 const [newSec] = await db
  .insert(executives)
  .values({
    id,
    committee,
    role,
    position,
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.committee],
    set: {
      role,
      position,
      assignedBy: user.id,
    },
  })
  .returning();
  return newSec;
};