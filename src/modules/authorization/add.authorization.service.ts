import { db } from "../../config/db";
import { executives, users } from "../../db/schema";
import { eq,and, or } from "drizzle-orm";
import { HTTPException } from "hono/http-exception";
import type { Context } from "hono";
import { genderMatch, getRolesByPriorityRange } from "../global/global.service";
import { log } from "node:console";


// FUNCTIONS TO ADD VICE PRESIDENT
export const addVicePresident = async (id: string,role: string,number: string,c: Context) => {
  
     const user = c.get("user");

   console.log("testin on",role);
   
  if(role !== "vice president 1" && role !== "vice president 2" &&  role !== "vice president 3" && role !== "vice president 4"){
    throw new HTTPException(400, { message: `Invalid role ${role}. Must be vice president 1, 2, 3, or 4` });
  }
 if(await genderMatch(user.id, number) === false){
  throw new HTTPException(403, {
    message: "You cannot create a committee for a different gender",
  });
 }
 const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.number, number),
      eq(executives.role, role)
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Role ${role} already exists in number ${number}` });
  }

  const [newVP] = 
  await db
  .insert(executives)
  .values({
    id,
    number,
    role,
    position: "vice president",
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.number],
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
export const addTreasurer = async (id: string,number: string,c: Context) => {
const user = c.get("user");   

 if(await genderMatch(user.id, number) === false){
  throw new HTTPException(403, {
    message: "You cannot create a committee for a different gender",
  });
 }
const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.number, number),
      eq(executives.role, "treasurer")
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Treasurer already exists in number ${number}` });
  }
  
  const [newTrsr] =
  await db
  .insert(executives)
  .values({
    id,
    role: "treasurer",
    position: "treasurer",
    number,
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.number],
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
export const addGeneralSecretary = async (id: string,number: string,c: Context) => {
const user = c.get("user"); 
 if(await genderMatch(user.id, number) === false){
  throw new HTTPException(403, {
    message: "You cannot create a committee for a different gender",
  });
 }  
const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.number, number),
      eq(executives.role, "general secretary")
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `General Secretary already exists in number ${number}` });
  }
  
  const [newGS] =
  await db
  .insert(executives)
  .values({
    id,
    role: "general secretary",
    position: "general secretary",
    number,
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.number],
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
export const addAsstGeneralSecretary = async (id: string,role: string,number: string,c: Context) => {
  
     const user = c.get("user");
    //  4 = assistant general secretary 1,2,....
     const roles = await getRolesByPriorityRange(4,4);
     console.log(roles);
     
     if (!roles.includes(role)) {
      throw new HTTPException(409, { message: `role not in allowed range` });
      }
  
 if(await genderMatch(user.id, number) === false){
  throw new HTTPException(403, {
    message: "You cannot create a committee for a different gender",
  });
 }
 const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.number, number),
      eq(executives.role, role)
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Role ${role} already exists in number ${number}` });
  }
 const [newAGS] = await db
  .insert(executives)
  .values({
    id,
    number,
    role,
    position: "assistant general secretary",
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.number],
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


export const addSecretaries = async (id: string,position : string, role: string,number: string,c: Context) => {
  
     const user = c.get("user");
   
    //  5 = secretary, 6 = assistant secretary
    const roles = await getRolesByPriorityRange(5,6);
     console.log(roles);
     
     if (!roles.includes(role)) {
      throw new HTTPException(409, { message: `role not in allowed range` });
      }

   if(await genderMatch(user.id, number) === false){
  throw new HTTPException(403, {
    message: "You cannot create a committee for a different gender",
  });
 }
  if(position == "president" || position == "general secretary" || position == "assistant general secretary" || position == "vice president" ){
    throw new HTTPException(400, { message: `Invalid position ${position}. Secretaries and assistant secretaries can't be in this position` });
  }
  
 const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.number, number),
      eq(executives.role, role),
      eq(executives.position, position)
    )
  );
  if (existing.length > 0) {
    throw new HTTPException(409, { message: `Role ${role} in position ${position} already exists in number ${number}` });
  }


 const [newSec] = await db
  .insert(executives)
  .values({
    id,
    number,
    role,
    position,
    assignedBy: user.id,
  })
  .onConflictDoUpdate({
    target: [executives.id, executives.number],
    set: {
      role,
      position,
      assignedBy: user.id,
    },
  })
  .returning();
  return newSec;
};






// FUNCTION TO ADD GENERAL SECRETARY
export const deleteMember = async (id: string,number: string,c: Context) => {
const user = c.get("user"); 
 if(await genderMatch(user.id, number) === false){
  throw new HTTPException(403, {
    message: "You cannot delete a member for a different gender",
  });
 }  
const existing = await db
  .select()
  .from(executives)
  .where(
    and(
      eq(executives.number, number),
      eq(executives.id, id)
    )
  );
  if (existing.length <= 0) {
    throw new HTTPException(409, { message: `Member not found in number ${number}` });
  }
  console.log(existing);
  
  const [del] =
 await db
  .delete(executives)
  .where(
    and(
      eq(executives.id, id),
      eq(executives.number, number)
    )
  );
 
  return { success: true, message: "Member deleted successfully" };
};