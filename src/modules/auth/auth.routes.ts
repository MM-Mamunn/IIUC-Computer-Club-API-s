import { Hono } from "hono";
import { register, login } from "./auth.controller";

const router = new Hono();
// console.log("in auth routes ");

router.post("/register", register);
router.post("/login", login);

export default router;
