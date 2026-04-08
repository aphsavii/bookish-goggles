import { TREND_CONFIG } from "../../config/tradingConfig.js";

export function calculateEmaSeries(values = [], period) {
  if (!Array.isArray(values) || values.length === 0 || !Number.isFinite(period) || period <= 0) {
    return [];
  }

  const multiplier = 2 / (period + 1);
  const series = [];
  let ema = Number(values[0]);

  if (!Number.isFinite(ema)) {
    return [];
  }

  series.push(Number(ema.toFixed(2)));

  for (let index = 1; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) {
      return [];
    }

    ema = ((value - ema) * multiplier) + ema;
    series.push(Number(ema.toFixed(2)));
  }

  return series;
}

export function getNiftyTrendFromCandles(candles = []) {
  const fastPeriod = TREND_CONFIG.niftyFastEmaPeriod ?? 5;
  const slowPeriod = TREND_CONFIG.niftySlowEmaPeriod ?? 9;
  const slopeLookback = TREND_CONFIG.niftySlopeLookbackCandles ?? 3;
  const minSlopePct = TREND_CONFIG.niftyMinSlopePct ?? 0.0005;
  const minimumCandles = Math.max(fastPeriod, slowPeriod, slopeLookback + 1);

  if (!Array.isArray(candles) || candles.length < minimumCandles) {
    return "flat";
  }

  const closes = candles.map((candle) => Number(candle.close));
  if (closes.some((close) => !Number.isFinite(close))) {
    return "flat";
  }

  const fastEmaSeries = calculateEmaSeries(closes, fastPeriod);
  const slowEmaSeries = calculateEmaSeries(closes, slowPeriod);
  if (fastEmaSeries.length === 0 || slowEmaSeries.length === 0) {
    return "flat";
  }

  const currentFastEma = fastEmaSeries[fastEmaSeries.length - 1];
  const currentSlowEma = slowEmaSeries[slowEmaSeries.length - 1];
  const slowEmaReference = slowEmaSeries[slowEmaSeries.length - 1 - slopeLookback];
  const lastClose = closes[closes.length - 1];

  if (!Number.isFinite(currentFastEma) || !Number.isFinite(currentSlowEma) || !Number.isFinite(slowEmaReference)) {
    return "flat";
  }

  const slowSlopePct = slowEmaReference !== 0
    ? (currentSlowEma - slowEmaReference) / slowEmaReference
    : 0;

  if (
    currentFastEma > currentSlowEma &&
    slowSlopePct >= minSlopePct &&
    lastClose >= currentFastEma
  ) {
    return "up";
  }

  if (
    currentFastEma < currentSlowEma &&
    slowSlopePct <= -minSlopePct &&
    lastClose <= currentFastEma
  ) {
    return "down";
  }

  return "flat";
}

export function analyzeNiftyTrend(candles = []) {
  const fastPeriod = TREND_CONFIG.niftyFastEmaPeriod ?? 5;
  const slowPeriod = TREND_CONFIG.niftySlowEmaPeriod ?? 9;
  const slopeLookback = TREND_CONFIG.niftySlopeLookbackCandles ?? 3;
  const minSlopePct = TREND_CONFIG.niftyMinSlopePct ?? 0.0005;
  const minimumCandles = Math.max(fastPeriod, slowPeriod, slopeLookback + 1);

  if (!Array.isArray(candles) || candles.length < minimumCandles) {
    return {
      trend: "flat",
      fastEma: null,
      slowEma: null,
      slowSlopePct: null,
      lastClose: candles.at(-1)?.close ?? null
    };
  }

  const closes = candles.map((candle) => Number(candle.close));
  if (closes.some((close) => !Number.isFinite(close))) {
    return {
      trend: "flat",
      fastEma: null,
      slowEma: null,
      slowSlopePct: null,
      lastClose: null
    };
  }

  const fastEmaSeries = calculateEmaSeries(closes, fastPeriod);
  const slowEmaSeries = calculateEmaSeries(closes, slowPeriod);
  if (fastEmaSeries.length === 0 || slowEmaSeries.length === 0) {
    return {
      trend: "flat",
      fastEma: null,
      slowEma: null,
      slowSlopePct: null,
      lastClose: closes.at(-1) ?? null
    };
  }

  const fastEma = fastEmaSeries.at(-1) ?? null;
  const slowEma = slowEmaSeries.at(-1) ?? null;
  const slowEmaReference = slowEmaSeries.at(-1 - slopeLookback) ?? null;
  const lastClose = closes.at(-1) ?? null;
  const slowSlopePct = Number.isFinite(slowEma) && Number.isFinite(slowEmaReference) && slowEmaReference !== 0
    ? Number((((slowEma - slowEmaReference) / slowEmaReference) * 100).toFixed(3))
    : null;

  return {
    trend: getNiftyTrendFromCandles(candles),
    fastEma,
    slowEma,
    slowSlopePct,
    minSlopePct: Number((minSlopePct * 100).toFixed(3)),
    lastClose
  };
}
