import { Hono } from "hono";
import { register, login, uploadImage } from "./auth.controller";
import { authMiddleware } from "../../middlewares/auth.middleware";

const router = new Hono();
// console.log("in auth routes ");

router.post("/register", register);
router.post("/login", login);
router.post(
  "/uploadimg",
  authMiddleware,
   uploadImage,
);
export default router;
