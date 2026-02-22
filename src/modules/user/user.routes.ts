import { Hono } from "hono";
import { authMiddleware } from "../../middlewares/auth.middleware";
import { requireRole } from "../../middlewares/role.middleware";

const router = new Hono();

router.get(
  "/teacher-dashboard",
  authMiddleware,
  requireRole([
    "president",
    "treasurer",
    "vice president",
    "general secretary",
    "asst general secretary",
  ]),
  (c) => c.json({ message: "Welcome boss" }),
);

router.get(
  "/student-dashboard",
  authMiddleware,
  requireRole(["student"]),
  (c) => c.json({ message: "Welcome Student" }),
);

export default router;
