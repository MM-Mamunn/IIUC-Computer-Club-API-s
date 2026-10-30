import type { Context } from "hono";
import {  showPositions, showRoles } from "./general.service";
import { cdnCache } from "../../utils/cache";

export const positions = async (c: Context) => {
  const pos = await showPositions();

  cdnCache(c, 300);
  return c.json({ pos }, 200);
};


export const roles = async (c: Context) => {
  const role = await showRoles();

  cdnCache(c, 300);
  return c.json({ role }, 200);
};

