import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  // One connection made every query wait for the one before it, so parallel
  // requests (and Promise.all inside a request) ran one at a time. DATABASE_URL
  // is Neon's pooled (-pooler) endpoint, which is built for many short-lived
  // connections, so a small pool per instance is safe on serverless too.
  max: 10,
  connect_timeout: 15,
});

export const db = drizzle(client);
