import { Hono } from "hono";
import { positions, roles } from "./general.controller";



const router = new Hono();


router.get("/positions", positions);

router.get("/roles", roles);


export default router;
