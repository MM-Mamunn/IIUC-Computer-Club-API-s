import type { Context } from "hono";
import {  showPositions } from "./general.service";

export const positions = async (c: Context) => {
  const pos = await showPositions();

  return c.json({ pos }, 201);
};

