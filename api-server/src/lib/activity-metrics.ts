export function calculateActivitySummary(input: {
  startedAt: Date;
  endedAt: Date;
  distanceMeters: number;
  movingSeconds: number;
  elevationGainMeters: number;
}) {
  const elapsedSeconds = Math.max(
    0,
    Math.round((input.endedAt.getTime() - input.startedAt.getTime()) / 1000),
  );

  return {
    distanceMeters: input.distanceMeters,
    elapsedSeconds,
    movingSeconds: input.movingSeconds,
    elevationGainMeters: input.elevationGainMeters,
    avgSpeedMps:
      input.movingSeconds > 0
        ? input.distanceMeters / input.movingSeconds
        : 0,
  };
}
