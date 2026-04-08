import test from "node:test";
import assert from "node:assert/strict";
import { calculateEmaSeries, getNiftyTrendFromCandles } from "../functions/helpers/trendEngine.js";

function createCandles(closes) {
  return closes.map((close, index) => ({
    close,
    open: close,
    high: close + 1,
    low: close - 1,
    timestamp: `2026-04-08T09:${String(15 + index).padStart(2, "0")}:00+05:30`
  }));
}

test("calculateEmaSeries returns an EMA value for each close", () => {
  const series = calculateEmaSeries([100, 102, 104, 106], 3);

  assert.equal(series.length, 4);
  assert.equal(series[0], 100);
  assert.ok(series[3] > series[2]);
});

test("trend engine classifies sustained upside as up", () => {
  const candles = createCandles([100, 101, 102, 103, 104, 105, 106, 107, 108, 109]);
  assert.equal(getNiftyTrendFromCandles(candles), "up");
});

test("trend engine classifies sustained downside as down", () => {
  const candles = createCandles([109, 108, 107, 106, 105, 104, 103, 102, 101, 100]);
  assert.equal(getNiftyTrendFromCandles(candles), "down");
});

test("trend engine keeps mixed action as flat", () => {
  const candles = createCandles([100, 100.2, 100.1, 100.25, 100.15, 100.2, 100.18, 100.22, 100.19, 100.2]);
  assert.equal(getNiftyTrendFromCandles(candles), "flat");
});
