import { Hono } from "hono";
import { register, login, uploadImage, me, updateUserController, changePass } from "./auth.controller";
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
router.get(
  "/me",
  authMiddleware,
    me,
);

router.put(
  "/update",
  authMiddleware,
   updateUserController,
);

router.put(
  "/change-password",
  authMiddleware,
   changePass,
);
export default router;
