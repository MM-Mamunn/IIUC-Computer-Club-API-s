import type { Context } from "hono";
import {  showPositions, showRoles } from "./general.service";

export const positions = async (c: Context) => {
  const pos = await showPositions();

  return c.json({ pos }, 201);
};


export const roles = async (c: Context) => {
  const role = await showRoles();

  return c.json({ role }, 201);
};

