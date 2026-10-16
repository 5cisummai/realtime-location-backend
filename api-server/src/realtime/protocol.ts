import { z } from "zod";

export const realtimePointSchema = z.object({
  id: z.string().uuid().optional(),
  lat: z.number().min(-90).max(90),
  lng: z.number().min(-180).max(180),
  recordedAt: z.coerce.date(),
  altitude: z.number().optional(),
  speed: z.number().min(0).optional(),
  heading: z.number().min(0).max(360).optional(),
  accuracy: z.number().min(0).optional(),
});

export const clientMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("subscribe"),
    channel: z.string().regex(/^activity:[A-Za-z0-9_-]+$/),
    ref: z.string().optional(),
  }),
  z.object({
    type: z.literal("unsubscribe"),
    channel: z.string().regex(/^activity:[A-Za-z0-9_-]+$/),
    ref: z.string().optional(),
  }),
  z.object({
    type: z.literal("location"),
    activityId: z.string().min(1),
    points: z.array(realtimePointSchema).min(1).max(500),
    ref: z.string().optional(),
  }),
  z.object({ type: z.literal("ping"), ref: z.string().optional() }),
]);

export type ClientMessage = z.infer<typeof clientMessageSchema>;

export type ServerMessage =
  | { type: "snapshot"; channel: string; data: unknown }
  | { type: "location"; channel: string; data: unknown }
  | { type: "activity.status"; channel: string; data: unknown }
  | { type: "ack"; ref?: string | undefined; data?: unknown }
  | { type: "error"; code: string; message: string; ref?: string | undefined }
  | { type: "pong"; ref?: string | undefined };
