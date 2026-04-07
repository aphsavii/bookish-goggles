import test from "node:test";
import assert from "node:assert/strict";
import { runBacktest } from "../functions/backtest/backtestRunner.js";

test("backtest runner produces trades and metrics from normalized candles", async () => {
  const candles = [
    ["2026-04-05T09:50:00+05:30", 100, 101, 99, 100, 50],
    ["2026-04-05T09:51:00+05:30", 100, 102, 99, 101, 60],
    ["2026-04-05T09:52:00+05:30", 101, 103, 100, 102, 70],
    ["2026-04-05T09:53:00+05:30", 102, 108, 101, 107, 250],
    ["2026-04-05T09:54:00+05:30", 108, 112, 107, 111, 180],
    ["2026-04-05T09:55:00+05:30", 111, 116, 110, 115, 190]
  ];

  const result = await runBacktest({
    symbol: "SBIN",
    symbolToken: "3045",
    fromDate: "2026-04-05 09:50",
    toDate: "2026-04-05 09:55",
    averageHistoricalVolPerMin: 100,
    candles
  });

  assert.ok(result.signals.length >= 1);
  assert.ok(result.trades.length >= 1);
  assert.equal(typeof result.metrics.netPnl, "number");
});
