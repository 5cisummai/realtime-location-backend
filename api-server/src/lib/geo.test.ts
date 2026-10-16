import { describe, expect, test } from "bun:test";
import {
  encodePolyline,
  toApiPoint,
  toDatabasePoint,
  toGeoJsonLineString,
} from "./geo.js";

describe("geo helpers", () => {
  test("maps API lat/lng to PostGIS x/y and back", () => {
    const apiPoint = { lat: 37.7749, lng: -122.4194 };
    const databasePoint = toDatabasePoint(apiPoint);

    expect(databasePoint).toEqual({ x: -122.4194, y: 37.7749 });
    expect(toApiPoint(databasePoint)).toEqual(apiPoint);
  });

  test("creates GeoJSON in longitude/latitude order", () => {
    expect(
      toGeoJsonLineString([
        { lat: 37, lng: -122 },
        { lat: 38, lng: -121 },
      ]),
    ).toEqual({
      type: "LineString",
      coordinates: [
        [-122, 37],
        [-121, 38],
      ],
    });
  });

  test("encodes a route as a polyline", () => {
    expect(
      encodePolyline([
        { lat: 38.5, lng: -120.2 },
        { lat: 40.7, lng: -120.95 },
        { lat: 43.252, lng: -126.453 },
      ]),
    ).toBe("_p~iF~ps|U_ulLnnqC_mqNvxq`@");
  });
});
