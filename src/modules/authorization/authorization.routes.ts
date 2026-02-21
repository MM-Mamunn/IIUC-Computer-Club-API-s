import { Hono } from "hono";
import { addVp, addTrsr, addAGS, addGS } from "./authorization.controller";
import { requireRole } from "../../middlewares/role.middleware";
import { authMiddleware } from "../../middlewares/auth.middleware";
const router = new Hono();
// console.log("in auth routes ");

router.post("/addvp", authMiddleware, requireRole(["president"]), addVp);

router.post(
  "/addtreasurer",
  authMiddleware,
  requireRole(["president"]),
  addTrsr,
);

router.post(
  "/addgs",
  authMiddleware,
  requireRole(["president", "treasurer", "vice president"]),
  addGS,
);

router.post(
  "/addags",
  authMiddleware,
  requireRole(["president", "treasurer", "vice president"]),
  addAGS,
);
export default router;
