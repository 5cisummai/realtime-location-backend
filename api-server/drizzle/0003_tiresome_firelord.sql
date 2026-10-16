CREATE TYPE "public"."activity_status" AS ENUM('active', 'paused', 'finished');--> statement-breakpoint
CREATE TYPE "public"."activity_visibility" AS ENUM('private', 'public');--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "status" "activity_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "visibility" "activity_visibility" DEFAULT 'private' NOT NULL;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "end_location" geometry(Point, 4326);--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "distance_meters" double precision;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "elapsed_seconds" integer;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "moving_seconds" integer;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "elevation_gain_meters" double precision;--> statement-breakpoint
ALTER TABLE "activity" ADD COLUMN "avg_speed_mps" double precision;--> statement-breakpoint
CREATE INDEX "activity_end_location_gix" ON "activity" USING gist ("end_location");--> statement-breakpoint
CREATE UNIQUE INDEX "location_ping_activity_recorded_unique" ON "location_ping" USING btree ("activity_id","recorded_at");