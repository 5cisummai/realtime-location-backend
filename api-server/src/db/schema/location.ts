import { relations, sql } from "drizzle-orm";
import {
  doublePrecision,
  geometry,
  index,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";

export const activityStatus = pgEnum("activity_status", [
  "active",
  "paused",
  "finished",
]);

export const activityVisibility = pgEnum("activity_visibility", [
  "private",
  "public",
]);

/**
 * Tracked activity (run, ride, hike, etc.).
 * Start point uses PostGIS geometry(Point, 4326) — lon/lat as { x, y }.
 */
export const activity = pgTable(
  "activity",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sport: text("sport").notNull().default("run"),
    status: activityStatus("status").notNull().default("active"),
    visibility: activityVisibility("visibility").notNull().default("private"),
    startedAt: timestamp("started_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    startLocation: geometry("start_location", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }),
    endLocation: geometry("end_location", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }),
    distanceMeters: doublePrecision("distance_meters"),
    elapsedSeconds: integer("elapsed_seconds"),
    movingSeconds: integer("moving_seconds"),
    elevationGainMeters: doublePrecision("elevation_gain_meters"),
    avgSpeedMps: doublePrecision("avg_speed_mps"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("activity_userId_idx").on(table.userId),
    index("activity_start_location_gix").using("gist", table.startLocation),
    index("activity_end_location_gix").using("gist", table.endLocation),
  ],
);

/**
 * GPS samples for an activity (or live pings while tracking).
 * Prefer writing with { x: longitude, y: latitude }.
 */
export const locationPing = pgTable(
  "location_ping",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activityId: text("activity_id").references(() => activity.id, {
      onDelete: "cascade",
    }),
    recordedAt: timestamp("recorded_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    location: geometry("location", {
      type: "point",
      mode: "xy",
      srid: 4326,
    }).notNull(),
    altitudeMeters: doublePrecision("altitude_meters"),
    speedMps: doublePrecision("speed_mps"),
    headingDegrees: doublePrecision("heading_degrees"),
    accuracyMeters: doublePrecision("accuracy_meters"),
  },
  (table) => [
    index("location_ping_userId_idx").on(table.userId),
    index("location_ping_activityId_idx").on(table.activityId),
    index("location_ping_recordedAt_idx").on(table.recordedAt),
    index("location_ping_location_gix").using("gist", table.location),
    uniqueIndex("location_ping_activity_recorded_unique").on(
      table.activityId,
      table.recordedAt,
    ),
  ],
);

export const activityRelations = relations(activity, ({ one, many }) => ({
  user: one(user, {
    fields: [activity.userId],
    references: [user.id],
  }),
  pings: many(locationPing),
}));

export const locationPingRelations = relations(locationPing, ({ one }) => ({
  user: one(user, {
    fields: [locationPing.userId],
    references: [user.id],
  }),
  activity: one(activity, {
    fields: [locationPing.activityId],
    references: [activity.id],
  }),
}));

/** Lon/lat → PostGIS point SQL (SRID 4326). Prefer this when mode/xy insert is awkward. */
export function makePointSql(longitude: number, latitude: number) {
  return sql`ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)`;
}
