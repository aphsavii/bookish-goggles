import test from "node:test";
import assert from "node:assert/strict";
import {
  buildIntradayVolumeProfile,
  mergeCandleIntoIntradayVolumeProfile
} from "../functions/helpers/intradayVolumeProfile.js";

test("buildIntradayVolumeProfile aggregates same minute across sessions", () => {
  const profile = buildIntradayVolumeProfile([
    { timestamp: "2026-04-01T10:00:00+05:30", volume: 100 },
    { timestamp: "2026-04-02T10:00:00+05:30", volume: 140 },
    { timestamp: "2026-04-03T10:00:00+05:30", volume: 160 },
    { timestamp: "2026-04-03T10:01:00+05:30", volume: 90 }
  ]);

  assert.equal(profile["10:00"].sampleCount, 3);
  assert.equal(profile["10:00"].averageVolumePerMin, 133.33);
  assert.equal(profile["10:01"].sampleCount, 1);
  assert.equal(profile["10:01"].averageVolumePerMin, 90);
});

test("mergeCandleIntoIntradayVolumeProfile updates an existing minute bucket", () => {
  const profile = buildIntradayVolumeProfile([
    { timestamp: "2026-04-01T10:00:00+05:30", volume: 100 }
  ]);

  mergeCandleIntoIntradayVolumeProfile(profile, {
    timestamp: "2026-04-02T10:00:00+05:30",
    volume: 140
  });

  assert.equal(profile["10:00"].sampleCount, 2);
  assert.equal(profile["10:00"].averageVolumePerMin, 120);
});
