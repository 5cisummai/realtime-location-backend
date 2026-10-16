CREATE TABLE "activity" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"sport" text DEFAULT 'run' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"start_location" geometry(Point, 4326),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_ping" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"activity_id" text,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"location" geometry(Point, 4326) NOT NULL,
	"altitude_meters" double precision,
	"speed_mps" double precision,
	"heading_degrees" double precision,
	"accuracy_meters" double precision
);
--> statement-breakpoint
ALTER TABLE "activity" ADD CONSTRAINT "activity_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_ping" ADD CONSTRAINT "location_ping_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_ping" ADD CONSTRAINT "location_ping_activity_id_activity_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activity"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_userId_idx" ON "activity" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "activity_start_location_gix" ON "activity" USING gist ("start_location");--> statement-breakpoint
CREATE INDEX "location_ping_userId_idx" ON "location_ping" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "location_ping_activityId_idx" ON "location_ping" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "location_ping_recordedAt_idx" ON "location_ping" USING btree ("recorded_at");--> statement-breakpoint
CREATE INDEX "location_ping_location_gix" ON "location_ping" USING gist ("location");