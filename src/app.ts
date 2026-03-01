import { Hono } from "hono";
import authRoutes from "./modules/auth/auth.routes";
import authorizationRoutes from "./modules/authorization/authorization.routes";
import userRoutes from "./modules/user/user.routes";
import committeeRoutes from "./modules/committee/committee.routes";

const app = new Hono();

/**
 * Basic test route
 */
app.get("/", (c) => {
  return c.json({
    success: true,
    message: "API is running 🚀",
    timestamp: new Date().toISOString() 
  });
});

/**
 * API Routes
 */
app.route("/api/auth", authRoutes);
app.route("/api/users", userRoutes);
app.route("/api/authorization", authorizationRoutes);
app.route("/api/committee", committeeRoutes);

export default app;
