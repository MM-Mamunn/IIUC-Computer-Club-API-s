import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const client = postgres(process.env.DATABASE_URL!, {
  ssl: "require",
  max: 1, // good for serverless environments
});

export const db = drizzle(client);
