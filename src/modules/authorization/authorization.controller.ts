import type { Context } from "hono";
import {
  addTreasurer,
  addVicePresident,
  addAsstGeneralSecretary,
  addGeneralSecretary,
  addSecretaries
} from "./add.authorization.service";

export const addVp = async (c: Context) => {
  const { id, role, committee } = await c.req.json();

  const addvp = await addVicePresident(id, role, committee, c);
  return c.json({ addvp }, 201);
};

export const addTrsr = async (c: Context) => {
  const { id, committee } = await c.req.json();

  const addtrsr = await addTreasurer(id, committee, c);
  return c.json({ addtrsr }, 201);
};

export const addGS = async (c: Context) => {
  const { id, committee } = await c.req.json();

  const addgs = await addGeneralSecretary(id, committee, c);
  return c.json({ addgs }, 201);
};

export const addAGS = async (c: Context) => {
  const { id, role, committee } = await c.req.json();

  const addvp = await addAsstGeneralSecretary(id, role, committee, c);
  return c.json({ addvp }, 201);
};
export const addSec = async (c: Context) => {
  const { id, role, position, committee } = await c.req.json();
  const addvp = await addSecretaries(id, position, role, committee, c);
  return c.json({ addvp }, 201);
};
