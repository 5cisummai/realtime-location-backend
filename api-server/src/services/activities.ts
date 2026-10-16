import { and, desc, eq, lt, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { activity, locationPing } from "../db/schema/location.js";
import { ApiError } from "../lib/errors.js";
import { calculateActivitySummary } from "../lib/activity-metrics.js";
import { toDatabasePoint, type ApiPoint } from "../lib/geo.js";
import { redis } from "../redis.js";

export type ActivityStatus = "active" | "paused" | "finished";
export type ActivityVisibility = "private" | "public";

export async function getOwnedActivity(id: string, userId: string) {
  const [row] = await db
    .select()
    .from(activity)
    .where(and(eq(activity.id, id), eq(activity.userId, userId)))
    .limit(1);

  if (!row) {
    throw new ApiError(404, "ACTIVITY_NOT_FOUND", "Activity was not found.");
  }

  return row;
}

export async function createActivity(
  userId: string,
  input: {
    id?: string | undefined;
    name?: string | undefined;
    sport: string;
    startedAt?: Date | undefined;
    startLocation?: ApiPoint | undefined;
    visibility?: ActivityVisibility | undefined;
  },
) {
  const id = input.id ?? crypto.randomUUID();
  const [created] = await db
    .insert(activity)
    .values({
      id,
      userId,
      name: input.name ?? `${input.sport} activity`,
      sport: input.sport,
      startedAt: input.startedAt,
      startLocation: input.startLocation
        ? toDatabasePoint(input.startLocation)
        : undefined,
      visibility: input.visibility,
    })
    .onConflictDoNothing({ target: activity.id })
    .returning();

  if (created) return created;
  return getOwnedActivity(id, userId);
}

export async function listActivities(
  userId: string,
  options: {
    limit: number;
    cursor?: string | undefined;
    sport?: string | undefined;
  },
) {
  let cursor: { startedAt: Date; id: string } | undefined;
  if (options.cursor) {
    try {
      const [startedAt, id] = Buffer.from(options.cursor, "base64url")
        .toString("utf8")
        .split("|");
      if (!startedAt || !id) throw new Error("Malformed cursor");
      cursor = { startedAt: new Date(startedAt), id };
      if (Number.isNaN(cursor.startedAt.getTime())) throw new Error("Invalid date");
    } catch {
      throw new ApiError(400, "INVALID_CURSOR", "The pagination cursor is invalid.");
    }
  }

  const filters = [
    eq(activity.userId, userId),
    cursor
      ? or(
          lt(activity.startedAt, cursor.startedAt),
          and(
            eq(activity.startedAt, cursor.startedAt),
            lt(activity.id, cursor.id),
          ),
        )
      : undefined,
    options.sport ? eq(activity.sport, options.sport) : undefined,
  ].filter((value) => value !== undefined);

  const rows = await db
    .select()
    .from(activity)
    .where(and(...filters))
    .orderBy(desc(activity.startedAt), desc(activity.id))
    .limit(options.limit + 1);
  const hasMore = rows.length > options.limit;
  const data = rows.slice(0, options.limit);

  return {
    data,
    nextCursor: hasMore
      ? encodeCursor(data.at(-1)!)
      : null,
  };
}

function encodeCursor(value: { id: string; startedAt: Date }): string {
  return Buffer.from(
    `${value.startedAt.toISOString()}|${value.id}`,
    "utf8",
  ).toString("base64url");
}

export async function updateActivity(
  id: string,
  userId: string,
  changes: {
    name?: string | undefined;
    sport?: string | undefined;
    visibility?: ActivityVisibility | undefined;
  },
) {
  await getOwnedActivity(id, userId);
  const [updated] = await db
    .update(activity)
    .set(changes)
    .where(eq(activity.id, id))
    .returning();
  return updated;
}

export async function deleteActivity(id: string, userId: string) {
  await getOwnedActivity(id, userId);
  await db.delete(activity).where(eq(activity.id, id));
}

export async function changeActivityStatus(
  id: string,
  userId: string,
  status: ActivityStatus,
) {
  const existing = await getOwnedActivity(id, userId);
  if (existing.status === "finished") {
    throw new ApiError(409, "ACTIVITY_FINISHED", "A finished activity cannot be changed.");
  }

  if (status === "finished") return finishActivity(id, userId);

  const [updated] = await db
    .update(activity)
    .set({ status })
    .where(eq(activity.id, id))
    .returning();
  await publishStatus(updated!);
  return updated;
}

async function finishActivity(id: string, userId: string) {
  await getOwnedActivity(id, userId);
  const result = await db.execute<{
    distance_meters: number | null;
    moving_seconds: number | null;
    elevation_gain_meters: number | null;
  }>(sql`
    WITH ordered AS (
      SELECT
        location,
        altitude_meters,
        speed_mps,
        recorded_at,
        LAG(recorded_at) OVER (ORDER BY recorded_at) AS previous_at,
        LAG(altitude_meters) OVER (ORDER BY recorded_at) AS previous_altitude
      FROM ${locationPing}
      WHERE ${locationPing.activityId} = ${id}
    )
    SELECT
      ST_Length(ST_MakeLine(location ORDER BY recorded_at)::geography) AS distance_meters,
      COALESCE(SUM(EXTRACT(EPOCH FROM recorded_at - previous_at))
        FILTER (WHERE speed_mps > 0.5), 0) AS moving_seconds,
      COALESCE(SUM(GREATEST(altitude_meters - previous_altitude, 0)), 0)
        AS elevation_gain_meters
    FROM ordered
  `);
  const stats = result[0];
  const [lastPing] = await db
    .select({ location: locationPing.location })
    .from(locationPing)
    .where(eq(locationPing.activityId, id))
    .orderBy(desc(locationPing.recordedAt))
    .limit(1);
  const endedAt = new Date();
  const existing = await getOwnedActivity(id, userId);
  const summary = calculateActivitySummary({
    startedAt: existing.startedAt,
    endedAt,
    distanceMeters: Number(stats?.distance_meters ?? 0),
    movingSeconds: Math.round(Number(stats?.moving_seconds ?? 0)),
    elevationGainMeters: Number(stats?.elevation_gain_meters ?? 0),
  });

  const [updated] = await db
    .update(activity)
    .set({
      status: "finished",
      endedAt,
      endLocation: lastPing?.location,
      ...summary,
    })
    .where(eq(activity.id, id))
    .returning();
  await publishStatus(updated!);
  return updated;
}

async function publishStatus(value: typeof activity.$inferSelect) {
  await redis.publish(
    `activity:${value.id}`,
    JSON.stringify({ type: "activity.status", channel: `activity:${value.id}`, data: value }),
  );
}
