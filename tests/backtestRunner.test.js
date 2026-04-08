import test from "node:test";
import assert from "node:assert/strict";
import { runBacktest } from "../functions/backtest/backtestRunner.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildTimestamp(index, baseHour = 9, baseMinute = 50) {
  const totalMinutes = baseMinute + index;
  const hour = baseHour + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `2026-04-05T${pad(hour)}:${pad(minute)}:00+05:30`;
}

function buildBaseCandles() {
  return Array.from({ length: 14 }, (_, index) => [
    buildTimestamp(index),
    100 + index,
    102 + index,
    98 + index,
    101 + index,
    80 + (index * 5)
  ]);
}

test("backtest runner produces trades and metrics from normalized candles", async () => {
  const candles = [
    ...buildBaseCandles(),
    [buildTimestamp(14), 114.5, 119, 114.2, 118.8, 300],
    [buildTimestamp(15), 119, 122, 118, 121, 220]
  ];

  const result = await runBacktest({
    symbol: "SBIN",
    symbolToken: "3045",
    fromDate: "2026-04-05 09:50",
    toDate: "2026-04-05 10:05",
    averageHistoricalVolPerMin: 100,
    candles
  });

  assert.ok(result.signals.length >= 1);
  assert.ok(result.trades.length >= 1);
  assert.equal(typeof result.metrics.netPnl, "number");
});

test("backtest runner keeps a runner after first target hit", async () => {
  const candles = [
    ...buildBaseCandles(),
    [buildTimestamp(14), 114.5, 119, 114.2, 118.8, 300],
    [buildTimestamp(15), 119, 132.5, 118, 131.8, 260],
    [buildTimestamp(16), 131.8, 132.4, 128.2, 129.1, 180]
  ];

  const result = await runBacktest({
    symbol: "SBIN",
    symbolToken: "3045",
    fromDate: "2026-04-05 09:50",
    toDate: "2026-04-05 10:06",
    averageHistoricalVolPerMin: 100,
    candles
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].partialExitCount, 1);
  assert.ok(Array.isArray(result.trades[0].partialExitHistory));
  assert.equal(result.trades[0].partialExitHistory.length, 1);
  assert.equal(result.trades[0].status, "CLOSED");
  assert.equal(result.trades[0].closedReason, "end-of-backtest");
  assert.ok(result.trades[0].realizedPnl > 0);
});

test("backtest runner closes remaining quantity at second target after partial exit", async () => {
  const candles = [
    ...buildBaseCandles(),
    [buildTimestamp(14), 114.5, 119, 114.2, 118.8, 300],
    [buildTimestamp(15), 119, 132.5, 118, 131.8, 260],
    [buildTimestamp(16), 131.8, 146.5, 131.2, 145.8, 210]
  ];

  const result = await runBacktest({
    symbol: "SBIN",
    symbolToken: "3045",
    fromDate: "2026-04-05 09:50",
    toDate: "2026-04-05 10:06",
    averageHistoricalVolPerMin: 100,
    candles
  });

  assert.equal(result.trades.length, 1);
  assert.equal(result.trades[0].partialExitCount, 1);
  assert.equal(result.trades[0].closedReason, "second-target-hit");
  assert.equal(result.trades[0].status, "CLOSED");
  assert.ok(result.trades[0].pnl > result.trades[0].realizedPnl);
});
