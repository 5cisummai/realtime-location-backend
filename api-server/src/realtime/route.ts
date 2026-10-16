import { createBunWebSocket } from "hono/bun";
import { Hono } from "hono";
import { createMiddleware } from "hono/factory";
import { and, eq, or } from "drizzle-orm";
import { auth, type Session } from "../auth.js";
import { db } from "../db/index.js";
import { activity } from "../db/schema/location.js";
import { ApiError } from "../lib/errors.js";
import { ingestLocationPoints } from "../services/ingest.js";
import {
  removeSocket,
  send,
  subscribeSocket,
  unsubscribeSocket,
} from "./hub.js";
import { clientMessageSchema } from "./protocol.js";

type RealtimeEnv = {
  Variables: {
    session: Session;
  };
};

export const { upgradeWebSocket, websocket } = createBunWebSocket();
export const realtimeRoutes = new Hono<RealtimeEnv>();

const authenticateSocket = createMiddleware<RealtimeEnv>(async (c, next) => {
  const headers = new Headers(c.req.raw.headers);
  const token = c.req.query("token");
  if (token && !headers.has("authorization")) {
    headers.set("authorization", `Bearer ${token}`);
  }
  const session = await auth.api.getSession({ headers });
  if (!session) {
    throw new ApiError(401, "UNAUTHORIZED", "A valid session is required.");
  }
  c.set("session", session);
  await next();
});

realtimeRoutes.get(
  "/realtime",
  authenticateSocket,
  upgradeWebSocket((c) => {
    const userId = c.get("session").user.id;
    return {
      onMessage: async (event, socket) => {
        try {
          const raw =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          const message = clientMessageSchema.parse(JSON.parse(raw));

          switch (message.type) {
            case "ping":
              send(socket, { type: "pong", ref: message.ref });
              return;
            case "subscribe": {
              const activityId = message.channel.slice("activity:".length);
              const [allowed] = await db
                .select({ id: activity.id })
                .from(activity)
                .where(
                  and(
                    eq(activity.id, activityId),
                    or(
                      eq(activity.userId, userId),
                      eq(activity.visibility, "public"),
                    ),
                  ),
                )
                .limit(1);
              if (!allowed) {
                send(socket, {
                  type: "error",
                  code: "FORBIDDEN_CHANNEL",
                  message: "You cannot subscribe to this channel.",
                  ref: message.ref,
                });
                return;
              }
              await subscribeSocket(socket, message.channel);
              send(socket, { type: "ack", ref: message.ref });
              return;
            }
            case "unsubscribe":
              await unsubscribeSocket(socket, message.channel);
              send(socket, { type: "ack", ref: message.ref });
              return;
            case "location": {
              const result = await ingestLocationPoints(
                message.activityId,
                userId,
                message.points,
              );
              send(socket, { type: "ack", ref: message.ref, data: result });
              return;
            }
            default: {
              const exhaustive: never = message;
              throw exhaustive;
            }
          }
        } catch (error) {
          send(socket, {
            type: "error",
            code: error instanceof ApiError ? error.code : "INVALID_MESSAGE",
            message: error instanceof Error ? error.message : "Invalid message.",
          });
        }
      },
      onClose: async (_event, socket) => {
        await removeSocket(socket);
      },
    };
  }),
);
