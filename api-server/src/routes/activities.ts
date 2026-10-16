import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { asc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { locationPing } from "../db/schema/location.js";
import { ApiError } from "../lib/errors.js";
import { encodePolyline, toApiPoint, toGeoJsonLineString } from "../lib/geo.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";
import {
  changeActivityStatus,
  createActivity,
  deleteActivity,
  getOwnedActivity,
  listActivities,
  updateActivity,
} from "../services/activities.js";
import { ingestLocationPoints } from "../services/ingest.js";

const pointSchema = z.object({
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
});
const activitySchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  sport: z.string(),
  status: z.enum(["active", "paused", "finished"]),
  visibility: z.enum(["private", "public"]),
  startedAt: z.date(),
  endedAt: z.date().nullable(),
  distanceMeters: z.number().nullable(),
  elapsedSeconds: z.number().int().nullable(),
  movingSeconds: z.number().int().nullable(),
  elevationGainMeters: z.number().nullable(),
  avgSpeedMps: z.number().nullable(),
  createdAt: z.date(),
  updatedAt: z.date(),
}).passthrough();
const activityIdParams = z.object({ id: z.string().min(1) });
const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});
const jsonContent = (schema: z.ZodType) => ({
  content: { "application/json": { schema } },
  description: "Successful response",
});

export const activitiesRoutes = new OpenAPIHono<SessionEnv>();
activitiesRoutes.use("/activities", requireSession);
activitiesRoutes.use("/activities/*", requireSession);

activitiesRoutes.openapi(
  createRoute({
    method: "post",
    path: "/activities",
    request: {
      body: {
        content: {
          "application/json": {
            schema: z.object({
              id: z.string().uuid().optional(),
              sport: z.string().min(1).max(40),
              name: z.string().min(1).max(120).optional(),
              startedAt: z.coerce.date().optional(),
              startLocation: pointSchema.optional(),
              visibility: z.enum(["private", "public"]).optional(),
            }),
          },
        },
      },
    },
    responses: { 201: jsonContent(activitySchema), 400: jsonContent(errorSchema) },
  }),
  async (c) => {
    const created = await createActivity(
      c.get("session").user.id,
      c.req.valid("json"),
    );
    return c.json(created, 201);
  },
);

activitiesRoutes.openapi(
  createRoute({
    method: "get",
    path: "/activities",
    request: {
      query: z.object({
        limit: z.coerce.number().int().min(1).max(100).default(20),
        cursor: z.string().optional(),
        sport: z.string().optional(),
      }),
    },
    responses: {
      200: jsonContent(
        z.object({
          data: z.array(activitySchema),
          nextCursor: z.string().nullable(),
        }),
      ),
    },
  }),
  async (c) =>
    c.json(
      await listActivities(c.get("session").user.id, c.req.valid("query")),
      200,
    ),
);

activitiesRoutes.openapi(
  createRoute({
    method: "get",
    path: "/activities/{id}",
    request: { params: activityIdParams },
    responses: { 200: jsonContent(activitySchema), 404: jsonContent(errorSchema) },
  }),
  async (c) =>
    c.json(
      await getOwnedActivity(c.req.valid("param").id, c.get("session").user.id),
      200,
    ),
);

activitiesRoutes.openapi(
  createRoute({
    method: "patch",
    path: "/activities/{id}",
    request: {
      params: activityIdParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({
              name: z.string().min(1).max(120).optional(),
              sport: z.string().min(1).max(40).optional(),
              visibility: z.enum(["private", "public"]).optional(),
            }),
          },
        },
      },
    },
    responses: { 200: jsonContent(activitySchema) },
  }),
  async (c) =>
    c.json(
      await updateActivity(
        c.req.valid("param").id,
        c.get("session").user.id,
        c.req.valid("json"),
      ),
      200,
    ),
);

activitiesRoutes.openapi(
  createRoute({
    method: "delete",
    path: "/activities/{id}",
    request: { params: activityIdParams },
    responses: { 204: { description: "Deleted" } },
  }),
  async (c) => {
    await deleteActivity(c.req.valid("param").id, c.get("session").user.id);
    return c.body(null, 204);
  },
);

const pointInputSchema = pointSchema.extend({
  id: z.string().uuid().optional(),
  recordedAt: z.coerce.date(),
  altitude: z.number().optional(),
  speed: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracy: z.number().min(0).optional(),
});

activitiesRoutes.openapi(
  createRoute({
    method: "post",
    path: "/activities/{id}/points",
    request: {
      params: activityIdParams,
      body: {
        content: {
          "application/json": {
            schema: z.object({ points: z.array(pointInputSchema).min(1).max(500) }),
          },
        },
      },
    },
    responses: {
      202: jsonContent(
        z.object({ accepted: z.number().int(), duplicates: z.number().int() }),
      ),
    },
  }),
  async (c) =>
    c.json(
      await ingestLocationPoints(
        c.req.valid("param").id,
        c.get("session").user.id,
        c.req.valid("json").points,
      ),
      202,
    ),
);

for (const [path, status] of [
  ["/activities/{id}/pause", "paused"],
  ["/activities/{id}/resume", "active"],
  ["/activities/{id}/finish", "finished"],
] as const) {
  activitiesRoutes.openapi(
    createRoute({
      method: "post",
      path,
      request: { params: activityIdParams },
      responses: { 200: jsonContent(activitySchema) },
    }),
    async (c) =>
      c.json(
        await changeActivityStatus(
          c.req.valid("param").id,
          c.get("session").user.id,
          status,
        ),
        200,
      ),
  );
}

activitiesRoutes.openapi(
  createRoute({
    method: "get",
    path: "/activities/{id}/track",
    request: {
      params: activityIdParams,
      query: z.object({ format: z.enum(["geojson", "polyline"]).default("geojson") }),
    },
    responses: { 200: jsonContent(z.unknown()) },
  }),
  async (c) => {
    const { id } = c.req.valid("param");
    await getOwnedActivity(id, c.get("session").user.id);
    const rows = await db
      .select({ location: locationPing.location })
      .from(locationPing)
      .where(eq(locationPing.activityId, id))
      .orderBy(asc(locationPing.recordedAt));
    const points = rows.map(({ location }) => toApiPoint(location));
    if (points.length < 2) {
      throw new ApiError(409, "TRACK_NOT_READY", "A track needs at least two points.");
    }
    return c.json(
      c.req.valid("query").format === "polyline"
        ? { format: "polyline", polyline: encodePolyline(points) }
        : {
            type: "Feature",
            properties: { activityId: id },
            geometry: toGeoJsonLineString(points),
          },
      200,
    );
  },
);
