import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import { sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activity } from "../db/schema/location.js";
import { requireSession, type SessionEnv } from "../middleware/session.js";

const periods = {
  week: "7 days",
  month: "1 month",
  year: "1 year",
} as const;

export const meRoutes = new OpenAPIHono<SessionEnv>();
meRoutes.use("/me/*", requireSession);

meRoutes.openapi(
  createRoute({
    method: "get",
    path: "/me/stats",
    request: {
      query: z.object({
        period: z.enum(["week", "month", "year", "all"]).default("all"),
      }),
    },
    responses: {
      200: {
        description: "Activity totals",
        content: {
          "application/json": {
            schema: z.object({
              period: z.string(),
              activityCount: z.number(),
              distanceMeters: z.number(),
              elapsedSeconds: z.number(),
              movingSeconds: z.number(),
              elevationGainMeters: z.number(),
            }),
          },
        },
      },
    },
  }),
  async (c) => {
    const { period } = c.req.valid("query");
    const userId = c.get("session").user.id;
    const interval = period === "all" ? null : periods[period];
    const rows = await db.execute<{
      activity_count: number;
      distance_meters: number;
      elapsed_seconds: number;
      moving_seconds: number;
      elevation_gain_meters: number;
    }>(sql`
      SELECT
        COUNT(*)::integer AS activity_count,
        COALESCE(SUM(distance_meters), 0)::float8 AS distance_meters,
        COALESCE(SUM(elapsed_seconds), 0)::integer AS elapsed_seconds,
        COALESCE(SUM(moving_seconds), 0)::integer AS moving_seconds,
        COALESCE(SUM(elevation_gain_meters), 0)::float8 AS elevation_gain_meters
      FROM ${activity}
      WHERE ${activity.userId} = ${userId}
        AND ${activity.status} = 'finished'
        AND (${interval}::text IS NULL OR ${activity.startedAt} >= NOW() - ${interval}::interval)
    `);
    const stats = rows[0]!;
    return c.json(
      {
        period,
        activityCount: Number(stats.activity_count),
        distanceMeters: Number(stats.distance_meters),
        elapsedSeconds: Number(stats.elapsed_seconds),
        movingSeconds: Number(stats.moving_seconds),
        elevationGainMeters: Number(stats.elevation_gain_meters),
      },
      200,
    );
  },
);
