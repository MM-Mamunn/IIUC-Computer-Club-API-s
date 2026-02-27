import { db } from "../../config/db";
import { executives, users } from "../../db/schema";
import { eq,and, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { getRolesByPriorityRange } from "../global/global.service";
import { log } from "node:console";


// FUNCTIONS TO ADD VICE PRESIDENT
export const addVicePresident = async (id: string,role: string,committee: string,c: Context) => {
  
     const user = c.get("user");

  //  console.log("role is",role);
   
  if(role !== "vice president 1" && role !== "vice president 2" &&  role !== "vice president 3" && role !== "vice president 4"){
    throw new HTTPException(400, { message: `Invalid role ${role}. Must be vice president 1, 2, 3, or 4` });
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
    //  4 = assistant general secretary 1,2,....
     const roles = await getRolesByPriorityRange(4,5);
     console.log(roles);
     
     if (!roles.includes(role)) {
      throw new HTTPException(409, { message: `role not in allowed range` });
      }
  
        console.log("testing asstgs now");

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
 log("new AGS is", newAGS);
  return newAGS;
};


export const addSecretaries = async (id: string,position : string, role: string,committee: string,c: Context) => {
  
     const user = c.get("user");
   
    //  5 = secretary, 6 = assistant secretary
    const roles = await getRolesByPriorityRange(5,7);
     console.log(roles);
     
     if (!roles.includes(role)) {
      throw new HTTPException(409, { message: `role not in allowed range` });
      }
  // if(role !== "secretary" && role !== "assistant secretary" ){
  //   throw new HTTPException(400, { message: `Invalid role ${role}. Must be secretary, assistant secretary` });
  // }
  
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