import type { Context } from "hono";
import {
  addTreasurer,
  addVicePresident,
  addAsstGeneralSecretary,
  addGeneralSecretary,
  addSecretaries
} from "./add.authorization.service";
import { genderMatch } from "../global/global.service";

export const addVp = async (c: Context) => {
  const { id, role, number } = await c.req.json();
   await genderMatch(id, number);
  const addvp = await addVicePresident(id, role, number, c);
  return c.json({ addvp }, 201);
};

export const addTrsr = async (c: Context) => {
  const { id, number } = await c.req.json();

  const addtrsr = await addTreasurer(id, number, c);
  return c.json({ addtrsr }, 201);
};

export const addGS = async (c: Context) => {
  const { id, number } = await c.req.json();
  await genderMatch(id, number);
  const addgs = await addGeneralSecretary(id, number, c);
  return c.json({ addgs }, 201);
};

export const addAGS = async (c: Context) => {
  const { id, role, number } = await c.req.json();
 await genderMatch(id, number);
  const addvp = await addAsstGeneralSecretary(id, role, number, c);
  return c.json({ addvp }, 201);
};
export const addSec = async (c: Context) => {
  const { id, role, position, number } = await c.req.json();
   await genderMatch(id, number);
  const addvp = await addSecretaries(id, position, role, number, c);
  return c.json({ addvp }, 201);
};
