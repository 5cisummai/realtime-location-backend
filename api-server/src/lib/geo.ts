import polyline from "@mapbox/polyline";

export type ApiPoint = {
  lat: number;
  lng: number;
};

export type DatabasePoint = {
  x: number;
  y: number;
};

export function toDatabasePoint(point: ApiPoint): DatabasePoint {
  return { x: point.lng, y: point.lat };
}

export function toApiPoint(point: DatabasePoint): ApiPoint {
  return { lat: point.y, lng: point.x };
}

export function toGeoJsonLineString(points: ApiPoint[]) {
  return {
    type: "LineString" as const,
    coordinates: points.map(({ lat, lng }) => [lng, lat]),
  };
}

export function encodePolyline(points: ApiPoint[]): string {
  return polyline.encode(points.map(({ lat, lng }) => [lat, lng]));
}
