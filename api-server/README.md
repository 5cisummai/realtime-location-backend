# api-server

Hono (Bun) API for the realtime location backend.

## Stack

- **Hono** on **Bun**
- **Better Auth** — email/password + bearer tokens
- **Drizzle** + **PostGIS** — activities and GPS points
- **Redis** — Better Auth secondary storage + live pub/sub

## Coordinates

| Layer | Shape |
| --- | --- |
| REST / WebSocket API | always `{ lat, lng }` |
| PostGIS / Drizzle | `{ x: longitude, y: latitude }` via `src/lib/geo.ts` |

Clients never send `x`/`y`.

## PostGIS

- Schema: `src/db/schema/location.ts` (`geometry(Point, 4326)`)
- Extension migration: `drizzle/0001_enable_postgis.sql`
- Spatial helpers: `src/db/geo.ts`
- After `drizzle-kit generate`, hand-fix new columns from `geometry(point)` → `geometry(Point, 4326)` if needed

**Railway:** do not use managed Postgres — it has no PostGIS. This project’s IaC runs `postgis/postgis:16-3.4`.

Local:

```bash
docker run --name postgis -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=realtime_location \
  -p 5432:5432 -d postgis/postgis:16-3.4
```

## Setup

```bash
cp .env.example .env
# PORT, DATABASE_URL, REDIS_URL, BETTER_AUTH_SECRET (≥32 chars), BETTER_AUTH_URL, CORS_ORIGIN
bun install
bun run db:migrate
bun run dev
```

```bash
openssl rand -base64 32   # BETTER_AUTH_SECRET
```

## Scripts

| Script | Description |
| --- | --- |
| `bun run dev` | Hot reload |
| `bun run start` | Production entry |
| `bun run test` | Unit tests |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run db:generate` | Generate Drizzle migrations |
| `bun run db:migrate` | Apply migrations |
| `bun run db:studio` | Drizzle Studio |
| `bun run auth:generate` | Regenerate Better Auth schema |
| `bun run smoke:realtime` | Two-client WS smoke (API + PostGIS + Redis) |

## HTTP API (`/v1`)

Errors: `{ "error": { "code", "message", "details?" } }`.

| Method | Path | Notes |
| --- | --- | --- |
| `GET` | `/health` | Liveness |
| `*` | `/api/auth/*` | Better Auth |
| `GET` | `/docs` | Scalar OpenAPI UI |
| `GET` | `/openapi.json` | OpenAPI 3.1 |
| `GET` | `/v1/me` | Current session |
| `POST` | `/v1/activities` | Start (optional client UUID) |
| `GET` | `/v1/activities` | Cursor list (`limit`, `cursor`, `sport`) |
| `GET`/`PATCH`/`DELETE` | `/v1/activities/:id` | CRUD |
| `POST` | `/v1/activities/:id/points` | Batch GPS (≤500), idempotent |
| `POST` | `/v1/activities/:id/pause\|resume\|finish` | Lifecycle; finish computes stats |
| `GET` | `/v1/activities/:id/track` | `?format=geojson\|polyline` |
| `GET` | `/v1/me/stats` | `?period=week\|month\|year\|all` |
| `GET` | `/v1/realtime` | WebSocket upgrade |

## Build a tracking app

1. Sign up / sign in via `/api/auth/*`. Prefer the `set-auth-token` / bearer token for mobile.
2. Send `Authorization: Bearer <token>` on REST calls.
3. Start an activity (optional `id` UUID for offline-safe retries).
4. Upload GPS batches to `/points` or over the WebSocket.
5. Subscribe on WS for live `snapshot` / `location` / `activity.status`.
6. `finish` then fetch `/track`.

### Start

```bash
curl -X POST "$API/v1/activities" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "52cf4116-d60d-41df-b177-a238bf7a11e5",
    "sport": "run",
    "name": "Morning run",
    "startLocation": { "lat": 37.7749, "lng": -122.4194 }
  }'
```

### Points

Retries are safe: unique `(activity_id, recorded_at)`; response is `{ accepted, duplicates }`.

```bash
curl -X POST "$API/v1/activities/52cf4116-d60d-41df-b177-a238bf7a11e5/points" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "points": [{
      "lat": 37.7749,
      "lng": -122.4194,
      "recordedAt": "2026-10-16T04:00:00.000Z",
      "accuracy": 5,
      "speed": 3.2,
      "altitude": 18
    }]
  }'
```

### WebSocket

`ws://…/v1/realtime` or `wss://…` in production. If headers are unavailable: `?token=<token>`.

```json
{"type":"subscribe","channel":"activity:52cf4116-d60d-41df-b177-a238bf7a11e5","ref":"sub-1"}
```

```json
{
  "type": "location",
  "activityId": "52cf4116-d60d-41df-b177-a238bf7a11e5",
  "ref": "batch-1",
  "points": [{
    "lat": 37.775,
    "lng": -122.418,
    "recordedAt": "2026-10-16T04:00:05.000Z"
  }]
}
```

Client → server: `subscribe`, `unsubscribe`, `location`, `ping`  
Server → client: `snapshot`, `location`, `activity.status`, `ack`, `error`, `pong`

### Finish + track

```bash
curl -X POST "$API/v1/activities/52cf4116-d60d-41df-b177-a238bf7a11e5/finish" \
  -H "Authorization: Bearer $TOKEN"

curl "$API/v1/activities/52cf4116-d60d-41df-b177-a238bf7a11e5/track?format=geojson" \
  -H "Authorization: Bearer $TOKEN"
```

Finish computes distance, elapsed/moving time, elevation gain, and average speed in PostGIS.

## Realtime scaling

Local sockets per instance; Redis pub/sub across instances; `live:activity:<id>` (TTL 24h) for join snapshots.

## Verification

```bash
bun run test
bun run typecheck
bun run smoke:realtime   # with API + PostGIS + Redis up
```
