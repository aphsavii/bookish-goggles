import { getIstDateParts } from "../../utils/time.js";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function getMinuteOfSessionKey(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const parts = getIstDateParts(parsed);
  return `${parts.hour}:${parts.minute}`;
}

function createEmptyBucket() {
  return {
    totalVolume: 0,
    sampleCount: 0,
    averageVolumePerMin: 0
  };
}

function finalizeBucket(bucket) {
  return {
    totalVolume: Number(bucket.totalVolume.toFixed(2)),
    sampleCount: bucket.sampleCount,
    averageVolumePerMin: bucket.sampleCount > 0
      ? Number((bucket.totalVolume / bucket.sampleCount).toFixed(2))
      : 0
  };
}

export function buildIntradayVolumeProfile(candles = []) {
  const profile = {};

  for (const candle of candles) {
    const minuteKey = getMinuteOfSessionKey(candle?.startTime ?? candle?.timestamp ?? candle?.bucket);
    const volume = toNumber(candle?.volume);

    if (!minuteKey || volume === null) {
      continue;
    }

    const bucket = profile[minuteKey] ?? createEmptyBucket();
    bucket.totalVolume += volume;
    bucket.sampleCount += 1;
    profile[minuteKey] = bucket;
  }

  return Object.fromEntries(
    Object.entries(profile).map(([minuteKey, bucket]) => [minuteKey, finalizeBucket(bucket)])
  );
}

export function mergeCandleIntoIntradayVolumeProfile(profile = {}, candle) {
  const minuteKey = getMinuteOfSessionKey(candle?.startTime ?? candle?.timestamp ?? candle?.bucket);
  const volume = toNumber(candle?.volume);

  if (!minuteKey || volume === null) {
    return profile;
  }

  const existing = profile[minuteKey] ?? createEmptyBucket();
  existing.totalVolume += volume;
  existing.sampleCount += 1;
  profile[minuteKey] = finalizeBucket(existing);
  return profile;
}

export function getIntradayProfileEntry(profile = {}, candleStartTime) {
  const minuteKey = getMinuteOfSessionKey(candleStartTime);
  if (!minuteKey) {
    return null;
  }

  return profile[minuteKey] ?? null;
}
