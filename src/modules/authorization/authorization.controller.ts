import type { Context } from 'hono';
import {
  addTreasurer,
  addVicePresident,
  addAsstGeneralSecretary,
  addGeneralSecretary,
  addSecretaries,
  addExecutiveMember,
  deleteMember,
} from './add.authorization.service';
import { genderMatch, assertNoHigherRole } from '../global/global.service';

export const addVp = async (c: Context) => {
  const { id, role, number } = await c.req.json();
  await genderMatch(id.toUpperCase(), number);
  await assertNoHigherRole(id.toUpperCase(), number, role);
  const addvp = await addVicePresident(id.toUpperCase(), role, number, c);
  return c.json(addvp, 200);
};

export const addTrsr = async (c: Context) => {
  const { id, number } = await c.req.json();
  await genderMatch(id.toUpperCase(), number);
  await assertNoHigherRole(id.toUpperCase(), number, 'treasurer');
  const addtrsr = await addTreasurer(id.toUpperCase(), number, c);
  return c.json(addtrsr, 200);
};

export const addGS = async (c: Context) => {
  const { id, number } = await c.req.json();
  await genderMatch(id.toUpperCase(), number);
  await assertNoHigherRole(id.toUpperCase(), number, 'general secretary');
  const addgs = await addGeneralSecretary(id.toUpperCase(), number, c);
  return c.json(addgs, 200);
};

export const addAGS = async (c: Context) => {
  console.log('Testing in');

  const { id, role, number } = await c.req.json();
  await genderMatch(id.toUpperCase(), number);
  await assertNoHigherRole(id.toUpperCase(), number, role);
  const addvp = await addAsstGeneralSecretary(id.toUpperCase(), role, number, c);
  return c.json(addvp, 200);
};
export const addSec = async (c: Context) => {
  const { id, role, position, number } = await c.req.json();
  await genderMatch(id.toUpperCase(), number);
  await assertNoHigherRole(id.toUpperCase(), number, role);
  const addsec = await addSecretaries(id.toUpperCase(), position, role, number, c);
  return c.json(addsec, 200);
};

export const addExec = async (c: Context) => {
  const { id, number } = await c.req.json();
  await genderMatch(id.toUpperCase(), number);
  await assertNoHigherRole(id.toUpperCase(), number, 'executive member');
  const addexec = await addExecutiveMember(id.toUpperCase(), number, c);
  return c.json(addexec, 200);
};

export const delMem = async (c: Context) => {
  const { id, number } = await c.req.json();

  const del = await deleteMember(id.toUpperCase(), number, c);
  return c.json(del, 200);
};
