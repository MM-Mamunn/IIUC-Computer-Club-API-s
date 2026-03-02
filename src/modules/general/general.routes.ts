import { Hono } from "hono";
import { positions } from "./general.controller";



const router = new Hono();


router.get("/positions", positions);


export default router;
