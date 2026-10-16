import {
  defineRailway,
  github,
  group,
  image,
  preserve,
  project,
  redis,
  service,
  volume,
} from "railway/iac";

/**
 * Railway Infrastructure as Code (replaces deprecated railway.toml / railway.json).
 *
 * PostGIS cannot use Railway's managed `postgres()` helper — that image has no
 * PostGIS extension. We run the official PostGIS Docker image with a volume.
 */
export default defineRailway(() => {
  const cache = redis("Redis");

  const postgisData = volume("postgis-data", {
    region: "us-west2",
    sizeMB: 2048,
  });

  const postgis = service("PostGIS", {
    source: image("postgis/postgis:16-3.4"),
    volumeMounts: {
      "/var/lib/postgresql/data": postgisData,
    },
    env: {
      POSTGRES_USER: "postgres",
      POSTGRES_DB: "realtime_location",
      POSTGRES_PASSWORD: preserve(),
      PGDATA: "/var/lib/postgresql/data/pgdata",
    },
  });

  const api = service("api-server", {
    source: github("5cisummai/realtime-location-backend", {
      branch: "main",
      rootDirectory: "api-server",
    }),
    start: "bun src/index.ts",
    preDeploy: "bun run db:migrate",
    healthcheck: "/health",
    healthcheckTimeout: 60,
    env: {
      PORT: "3000",
      DATABASE_URL: preserve(),
      REDIS_URL: cache.env.REDIS_URL,
      BETTER_AUTH_SECRET: preserve(),
      BETTER_AUTH_URL: preserve(),
      CORS_ORIGIN: preserve(),
    },
  });

  const data = group("Data", [postgis, postgisData, cache]);

  return project("Realtime Mobile Backend", {
    resources: [data, api],
  });
});
