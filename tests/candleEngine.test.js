import test from "node:test";
import assert from "node:assert/strict";
import { CandleEngine } from "../functions/engines/candleEngine.js";

test("candle engine closes the previous minute candle and tracks delta volume", () => {
  const engine = new CandleEngine();

  const first = engine.processTick({
    symbol: "SBIN",
    ltp: 100,
    cumulativeVolume: 1000,
    timestamp: new Date("2026-04-05T09:15:10+05:30")
  });

  assert.equal(first.closedCandle, null);

  engine.processTick({
    symbol: "SBIN",
    ltp: 102,
    cumulativeVolume: 1100,
    timestamp: new Date("2026-04-05T09:15:40+05:30")
  });

  const rollover = engine.processTick({
    symbol: "SBIN",
    ltp: 103,
    cumulativeVolume: 1300,
    timestamp: new Date("2026-04-05T09:16:05+05:30")
  });

  assert.ok(rollover.closedCandle);
  assert.equal(rollover.closedCandle.open, 100);
  assert.equal(rollover.closedCandle.close, 102);
  assert.equal(rollover.closedCandle.high, 102);
  assert.equal(rollover.closedCandle.low, 100);
  assert.equal(rollover.closedCandle.volume, 100);
});
