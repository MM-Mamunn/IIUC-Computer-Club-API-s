import { Hono } from "hono";
import { addVp, addTrsr, addAGS, addGS,addSec, delMem } from "./authorization.controller";
import { requireRole } from "../../middlewares/role.middleware";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {getRolesByPriorityRange} from "../global/global.service";
import { log } from "node:console";

const router = new Hono();
// log("Roles with priority 1 to 3:", await getRolesByPriorityRange(1, 3)); // Example usage

router.post("/addvp", authMiddleware, requireRole( await getRolesByPriorityRange(1,1)), addVp);

router.post(
  "/addtreasurer",
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1,1)),
  addTrsr,
);

router.post(
  "/addgs",
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1,2)),
  addGS,
);

router.post(
  "/addags",
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1,2)),
  addAGS,
);

router.post(
  "/addsecretaries",
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1,4)),
  addSec,
);
router.delete(
  "/delete",
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1,2)),
  delMem,
);
export default router;
