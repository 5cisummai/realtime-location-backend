import { OpenAPIHono } from "@hono/zod-openapi";
import { apiReference } from "@scalar/hono-api-reference";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { auth } from "./auth.js";
import { env } from "./env.js";
import { apiErrorHandler } from "./lib/errors.js";
import { requireSession } from "./middleware/session.js";
import { realtimeRoutes, websocket } from "./realtime/route.js";
import { connectRedis } from "./redis.js";
import { activitiesRoutes } from "./routes/activities.js";
import { meRoutes } from "./routes/me.js";

const app = new OpenAPIHono();

app.use("*", logger());
app.onError(apiErrorHandler);

app.use(
  "/api/auth/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "OPTIONS"],
    credentials: true,
  }),
);

app.use(
  "/v1/*",
  cors({
    origin: env.CORS_ORIGIN,
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true,
  }),
);

app.on(["POST", "GET"], "/api/auth/*", (c) => auth.handler(c.req.raw));

app.get("/health", (c) =>
  c.json({
    ok: true,
    service: "api-server",
  }),
);

app.get("/v1/me", requireSession, (c) => {
  const session = c.get("session");
  return c.json({
    user: session.user,
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt,
    },
  });
});

app.route("/v1", activitiesRoutes);
app.route("/v1", meRoutes);
app.route("/v1", realtimeRoutes);

app.doc("/openapi.json", {
  openapi: "3.1.0",
  info: {
    title: "Realtime Activity Tracking API",
    version: "1.0.0",
    description: "Offline-friendly activity and realtime location tracking.",
  },
});
app.get(
  "/docs",
  apiReference({
    url: "/openapi.json",
    theme: "default",
  }),
);

await connectRedis();

const server = Bun.serve({
  fetch: app.fetch,
  websocket,
  port: env.PORT,
  hostname: "0.0.0.0",
});

console.log(`api-server listening on http://localhost:${server.port}`);

export type AppType = typeof app;
