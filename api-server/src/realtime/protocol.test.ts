import { describe, expect, test } from "bun:test";
import { clientMessageSchema } from "./protocol.js";

describe("realtime protocol", () => {
  test("parses a location message and its timestamps", () => {
    const parsed = clientMessageSchema.parse({
      type: "location",
      activityId: "activity-1",
      points: [
        {
          lat: 37.7749,
          lng: -122.4194,
          recordedAt: "2026-01-01T00:00:00Z",
        },
      ],
    });

    expect(parsed.type).toBe("location");
    if (parsed.type === "location") {
      expect(parsed.points[0]?.recordedAt).toBeInstanceOf(Date);
    }
  });

  test("rejects invalid coordinates and channels", () => {
    expect(() =>
      clientMessageSchema.parse({
        type: "location",
        activityId: "activity-1",
        points: [{ lat: 100, lng: 0, recordedAt: new Date() }],
      }),
    ).toThrow();
    expect(() =>
      clientMessageSchema.parse({
        type: "subscribe",
        channel: "circle:not-yet-supported",
      }),
    ).toThrow();
  });
});
