import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { activity, locationPing } from "../db/schema/location.js";
import { ApiError } from "../lib/errors.js";
import { toDatabasePoint } from "../lib/geo.js";
import { redis } from "../redis.js";
import { getOwnedActivity } from "./activities.js";

export type LocationPointInput = {
  id?: string | undefined;
  lat: number;
  lng: number;
  recordedAt: Date;
  altitude?: number | undefined;
  speed?: number | undefined;
  heading?: number | undefined;
  accuracy?: number | undefined;
};

export async function ingestLocationPoints(
  activityId: string,
  userId: string,
  points: LocationPointInput[],
) {
  const trackedActivity = await getOwnedActivity(activityId, userId);
  if (trackedActivity.status === "finished") {
    throw new ApiError(409, "ACTIVITY_FINISHED", "Points cannot be added after finishing.");
  }
  if (points.length === 0) return { accepted: 0, duplicates: 0 };

  const inserted = await db
    .insert(locationPing)
    .values(
      points.map((point) => ({
        id: point.id ?? crypto.randomUUID(),
        userId,
        activityId,
        recordedAt: point.recordedAt,
        location: toDatabasePoint(point),
        altitudeMeters: point.altitude,
        speedMps: point.speed,
        headingDegrees: point.heading,
        accuracyMeters: point.accuracy,
      })),
    )
    .onConflictDoNothing()
    .returning();

  const newest = [...inserted].sort(
    (a, b) => b.recordedAt.getTime() - a.recordedAt.getTime(),
  )[0];

  if (newest) {
    const channel = `activity:${activityId}`;
    const event = {
      type: "location",
      channel,
      data: {
        id: newest.id,
        activityId,
        lat: newest.location.y,
        lng: newest.location.x,
        recordedAt: newest.recordedAt,
        altitude: newest.altitudeMeters,
        speed: newest.speedMps,
        heading: newest.headingDegrees,
        accuracy: newest.accuracyMeters,
      },
    };
    const serialized = JSON.stringify(event);
    await Promise.all([
      redis.set(`live:${channel}`, serialized, "EX", 86_400),
      redis.publish(channel, serialized),
    ]);

    if (!trackedActivity.startLocation) {
      await db
        .update(activity)
        .set({ startLocation: newest.location })
        .where(eq(activity.id, activityId));
    }
  }

  return {
    accepted: inserted.length,
    duplicates: points.length - inserted.length,
  };
}
