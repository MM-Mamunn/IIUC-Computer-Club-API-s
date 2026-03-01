import { Hono } from "hono";
import {  newCommittee } from "./committee.controller";
import { requireRole } from "../../middlewares/role.middleware";
import { authMiddleware } from "../../middlewares/auth.middleware";
import {getRolesByPriorityRange} from "../global/global.service";

const router = new Hono();

router.post(
  "/new",
  authMiddleware,
  requireRole(await getRolesByPriorityRange(1,1)),
  newCommittee,
);

export default router;
