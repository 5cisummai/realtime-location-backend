import { describe, expect, test } from "bun:test";
import { calculateActivitySummary } from "./activity-metrics.js";

describe("calculateActivitySummary", () => {
  test("calculates elapsed time and average moving speed", () => {
    expect(
      calculateActivitySummary({
        startedAt: new Date("2026-01-01T00:00:00Z"),
        endedAt: new Date("2026-01-01T00:10:00Z"),
        distanceMeters: 2_000,
        movingSeconds: 500,
        elevationGainMeters: 42,
      }),
    ).toEqual({
      distanceMeters: 2_000,
      elapsedSeconds: 600,
      movingSeconds: 500,
      elevationGainMeters: 42,
      avgSpeedMps: 4,
    });
  });

  test("does not divide by zero", () => {
    const summary = calculateActivitySummary({
      startedAt: new Date("2026-01-01T00:00:00Z"),
      endedAt: new Date("2026-01-01T00:00:00Z"),
      distanceMeters: 0,
      movingSeconds: 0,
      elevationGainMeters: 0,
    });

    expect(summary.avgSpeedMps).toBe(0);
  });
});
