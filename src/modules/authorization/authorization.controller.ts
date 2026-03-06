import type { Context } from "hono";
import {
  addTreasurer,
  addVicePresident,
  addAsstGeneralSecretary,
  addGeneralSecretary,
  addSecretaries,
  deleteMember
} from "./add.authorization.service";
import { genderMatch } from "../global/global.service";

export const addVp = async (c: Context) => {
  const { id, role, number } = await c.req.json();
   await genderMatch(id, number);
  const addvp = await addVicePresident(id, role, number, c);
  return c.json( addvp , 200);
};

export const addTrsr = async (c: Context) => {
  const { id, number } = await c.req.json();

  const addtrsr = await addTreasurer(id, number, c);
  return c.json( addtrsr , 200);
};

export const addGS = async (c: Context) => {
  const { id, number } = await c.req.json();
  await genderMatch(id, number);
  const addgs = await addGeneralSecretary(id, number, c);
  return c.json( addgs , 200);
};

export const addAGS = async (c: Context) => {
  console.log("Testing in");
  
  const { id, role, number } = await c.req.json();
  await genderMatch(id, number);
  const addvp = await addAsstGeneralSecretary(id, role, number, c);
  return c.json(addvp , 200);
};
export const addSec = async (c: Context) => {
  const { id, role, position, number } = await c.req.json();
   await genderMatch(id, number);
  const addsec = await addSecretaries(id, position, role, number, c);
  return c.json( addsec , 200);
};
export const delMem = async (c: Context) => {
  const { id, number } = await c.req.json();
   
  const del = await deleteMember(id, number,c);
  return c.json( del , 200);
};
