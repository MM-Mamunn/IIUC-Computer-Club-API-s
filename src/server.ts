import app from "./app";

Bun.serve({
  port: Number(process.env.PORT) || 3000,
  fetch: app.fetch,
});

console.log("Server running on http://localhost:3000");
