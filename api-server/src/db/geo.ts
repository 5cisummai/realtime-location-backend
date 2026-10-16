import { getTableColumns, sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import { db } from "./index.js";
import { locationPing, makePointSql } from "./schema/location.js";

export type LonLat = {
  longitude: number;
  latitude: number;
};

/** Build a geography-cast distance expression in meters. */
export function distanceMetersSql(
  column: SQL | unknown,
  point: LonLat,
): SQL<number> {
  const target = makePointSql(point.longitude, point.latitude);
  return sql<number>`ST_Distance(
    ${column}::geography,
    ${target}::geography
  )`;
}

/**
 * Nearest location pings to a coordinate (meters), using the GiST KNN operator.
 * Requires PostGIS + a GiST index on `location_ping.location`.
 */
export async function findNearestLocationPings(
  point: LonLat,
  options?: { limit?: number; maxDistanceMeters?: number },
) {
  const limit = options?.limit ?? 20;
  const target = makePointSql(point.longitude, point.latitude);
  const distance = distanceMetersSql(locationPing.location, point);

  const base = db
    .select({
      ...getTableColumns(locationPing),
      distanceMeters: distance,
    })
    .from(locationPing);

  if (options?.maxDistanceMeters != null) {
    return base
      .where(
        sql`ST_DWithin(
          ${locationPing.location}::geography,
          ${target}::geography,
          ${options.maxDistanceMeters}
        )`,
      )
      .orderBy(sql`${locationPing.location} <-> ${target}`)
      .limit(limit);
  }

  return base
    .orderBy(sql`${locationPing.location} <-> ${target}`)
    .limit(limit);
}

/**
 * Pings inside a bounding box (lon/lat degrees, SRID 4326).
 * Envelope order: minLon, minLat, maxLon, maxLat.
 */
export async function findLocationPingsInBounds(bounds: {
  minLongitude: number;
  minLatitude: number;
  maxLongitude: number;
  maxLatitude: number;
}) {
  return db
    .select()
    .from(locationPing)
    .where(
      sql`ST_Within(
        ${locationPing.location},
        ST_MakeEnvelope(
          ${bounds.minLongitude},
          ${bounds.minLatitude},
          ${bounds.maxLongitude},
          ${bounds.maxLatitude},
          4326
        )
      )`,
    );
}
