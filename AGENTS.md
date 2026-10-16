# AGENTS.md

Instructions for coding agents working in this repository.

## What this repo is

Railway template for a **mobile realtime location backend** (Strava / Life360 style).

Current code lives almost entirely under `api-server/`:

- Hono on **Bun**
- Better Auth (email/password + **bearer** tokens)
- Drizzle + **PostGIS** (not plain Postgres)
- Redis (Better Auth secondary storage + live pub/sub)

Do not invent a second app package unless asked. Prefer extending `api-server`.

## Non-negotiable conventions

1. **API coords are always `{ lat, lng }`.** Convert to PostGIS `{ x: lng, y: lat }` only in `api-server/src/lib/geo.ts` (or `makePointSql`). Never leak `x`/`y` into REST/WS payloads.
2. **Errors are always** `{ error: { code, message, details? } }` via `ApiError` + `apiErrorHandler` in `api-server/src/lib/errors.ts`. Do not invent ad-hoc error JSON.
3. **Versioned public API is `/v1`.** Auth stays at `/api/auth/*`. Do not put product routes under `/api`.
4. **Offline-safe writes:** activities and points accept client-generated IDs / timestamps. Dedup points with `UNIQUE(activity_id, recorded_at)` and `onConflictDoNothing`.
5. **Shared ingest path:** REST `POST /v1/activities/:id/points` and WS `type: "location"` both call `services/ingest.ts`. Do not duplicate insert/publish logic.
6. **Realtime fan-out goes through Redis.** Publish on `activity:<id>`, cache latest under `live:activity:<id>`. Use `redis` for publish/set and `redisSubscriber` only for subscribe.
7. **Exhaustive switches** over unions/enums: use a `never` default so new variants fail at compile time.
8. **Imports stay at the top of the file.** No inline imports.
9. Use **Bun**, not Node/`tsx`, for run/test scripts in `api-server`.

## Where to edit

| Task | Path |
| --- | --- |
| Mount routes / Bun serve / OpenAPI | `api-server/src/index.ts` |
| Env validation | `api-server/src/env.ts` |
| Auth config | `api-server/src/auth.ts` |
| Session middleware | `api-server/src/middleware/session.ts` |
| Activity HTTP routes | `api-server/src/routes/activities.ts` |
| Me/stats HTTP routes | `api-server/src/routes/me.ts` |
| Activity domain logic | `api-server/src/services/activities.ts` |
| GPS ingest + live publish | `api-server/src/services/ingest.ts` |
| WS protocol schemas | `api-server/src/realtime/protocol.ts` |
| WS hub / Redis fan-out | `api-server/src/realtime/hub.ts` |
| WS upgrade route | `api-server/src/realtime/route.ts` |
| Auth tables | `api-server/src/db/schema/auth.ts` |
| Activity / location tables | `api-server/src/db/schema/location.ts` |
| Spatial query helpers (DB) | `api-server/src/db/geo.ts` |
| Lat/lng ↔ PostGIS / polyline | `api-server/src/lib/geo.ts` |

## Commands (run from `api-server/`)

```bash
bun install
bun run dev
bun run test
bun run typecheck
bun run db:generate
bun run db:migrate
bun run smoke:realtime   # needs API + PostGIS + Redis running
```

After schema changes: generate a migration, then **hand-fix** any new `geometry(point)` columns to `geometry(Point, 4326)` before committing (drizzle-kit often omits SRID).

## Database / Redis

- `DATABASE_URL` must point at **PostGIS** (Railway: PostGIS template; local: `postgis/postgis:16-3.4`). Plain Postgres will fail on geometry / `CREATE EXTENSION postgis`.
- Migration order matters: `0001_enable_postgis.sql` before geometry tables.
- Redis is required for auth secondary storage and live location. Without it, startup or session behavior breaks.

Required env (see `api-server/.env.example`):

- `PORT`, `DATABASE_URL`, `REDIS_URL`
- `BETTER_AUTH_SECRET` (≥ 32 chars), `BETTER_AUTH_URL`, `CORS_ORIGIN`

## Auth for mobile / WS

- Prefer `Authorization: Bearer <token>` (better-auth `bearer` plugin).
- WebSocket clients that cannot set headers use `GET /v1/realtime?token=<token>`.
- Protect only the intended paths with `requireSession` (`/activities`, `/activities/*`, `/me/*`). Do **not** put `use("*", requireSession)` on a router that also mounts unrelated paths — that broke WS auth once.

## Realtime protocol (keep stable)

Client → server: `subscribe`, `unsubscribe`, `location`, `ping`  
Server → client: `snapshot`, `location`, `activity.status`, `ack`, `error`, `pong`

Channels today: `activity:<id>` only. New product surfaces (circles, user presence) should add new channel prefixes + the same authz hook pattern in `realtime/route.ts`, not a second socket stack.

## Verification before claiming done

1. `bun run test`
2. `bun run typecheck`
3. If you touched ingest/realtime/auth: run PostGIS + Redis + `bun run smoke:realtime` (or equivalent two-client check)
4. If you changed Drizzle schema: confirm migration SQL uses `geometry(Point, 4326)` and migrates cleanly

## Railway

**Do not create `railway.toml` or `railway.json`.** Those are deprecated Config as Code. New services cannot opt in; existing files stop being read on **2026-12-01**. Use Infrastructure as Code instead:

- Authoring file: [`.railway/railway.ts`](.railway/railway.ts)
- SDK: root `railway` package (`bun add -d railway`)
- Workflow: edit → `railway config plan` → `railway config apply` (only with explicit user approval)

Linked project: **Realtime Mobile Backend** (production).

| Service | Role |
| --- | --- |
| `api-server` | Bun Hono API (`start: bun src/index.ts`, `preDeploy: bun run db:migrate`, health `/health`) |
| `PostGIS` | `postgis/postgis:16-3.4` + volume `postgis-data` (not managed `postgres()` — no PostGIS there) |
| `Redis` | Managed Redis for auth secondary storage + realtime pub/sub |

GitHub: `5cisummai/realtime-location-backend` (branch `main`). IaC sets
`github(..., { rootDirectory: "api-server" })` so Railway builds from that folder.

Deploy options:

```bash
# From GitHub (after source is linked / on push if watch is on)
railway redeploy --service api-server --from-source --yes

# Or upload local tree
railway up ./api-server --path-as-root --service api-server --detach -m "<summary>"
```

Always poll `railway deployment list --service api-server --json` for that
deployment ID until `SUCCESS` before claiming a deploy worked.

Public domain: `railway domain --service api-server --json`.

Secrets / refs (`preserve()` in IaC — set via CLI, not committed):

- `PostGIS.POSTGRES_PASSWORD`
- `api-server.DATABASE_URL` → `postgresql://postgres:${{PostGIS.POSTGRES_PASSWORD}}@${{PostGIS.RAILWAY_PRIVATE_DOMAIN}}:5432/realtime_location`
- `api-server.BETTER_AUTH_SECRET`, `BETTER_AUTH_URL=https://${{RAILWAY_PUBLIC_DOMAIN}}`, `CORS_ORIGIN`

## Out of scope unless asked

- Circles / Life360 groups, geofences, social feed
- A second language stack or Node server entrypoint
- Generic marketing README expansion (this file is the agent source of truth; `api-server/README.md` is for human DX walkthroughs)
- Creating legacy `railway.toml` / `railway.json`
