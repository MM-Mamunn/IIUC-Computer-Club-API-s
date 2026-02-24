import app from "./app";
import {serve} from "@hono/node-server";

serve({
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
});

console.log("Server running on http://localhost:3000");
