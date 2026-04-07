import test from "node:test";
import assert from "node:assert/strict";
import { SignalEngine } from "../functions/engines/signalEngine.js";

test("signal engine emits breakout signal with volume confirmation", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      close: 110,
      volume: 300,
      startTime: "2026-04-05 09:20"
    },
    previousCandles: [
      { high: 100, low: 95 },
      { high: 103, low: 96 },
      { high: 105, low: 98 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    }
  });

  assert.ok(signal);
  assert.equal(signal.symbol, "SBIN");
  assert.equal(signal.side, "LONG");
  assert.equal(signal.breakoutLevel, 105);
  assert.equal(signal.historicalVolumeRatio, 3);
});

test("signal engine suppresses duplicate breakout signals inside cooldown window", () => {
  const engine = new SignalEngine();

  const first = engine.evaluateBreakout({
    candle: {
      close: 110,
      volume: 300,
      startTime: "2026-04-05T09:20:00+05:30"
    },
    previousCandles: [
      { high: 100, low: 95 },
      { high: 103, low: 96 },
      { high: 105, low: 98 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    }
  });

  const duplicate = engine.evaluateBreakout({
    candle: {
      close: 111,
      volume: 350,
      startTime: "2026-04-05T09:22:00+05:30"
    },
    previousCandles: [
      { high: 101, low: 95 },
      { high: 104, low: 97 },
      { high: 106, low: 99 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    }
  });

  assert.ok(first);
  assert.equal(duplicate, null);
});

test("signal engine emits breakdown short signal with volume confirmation", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      close: 94,
      volume: 300,
      startTime: "2026-04-05 09:20"
    },
    previousCandles: [
      { high: 100, low: 95 },
      { high: 103, low: 96 },
      { high: 105, low: 98 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    }
  });

  assert.ok(signal);
  assert.equal(signal.symbol, "SBIN");
  assert.equal(signal.side, "SHORT");
  assert.equal(signal.supportLevel, 95);
});

test("signal engine suppresses duplicate breakdown signals inside cooldown window", () => {
  const engine = new SignalEngine();

  const first = engine.evaluateBreakout({
    candle: {
      close: 94,
      volume: 300,
      startTime: "2026-04-05T09:20:00+05:30"
    },
    previousCandles: [
      { high: 100, low: 95 },
      { high: 103, low: 96 },
      { high: 105, low: 98 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    }
  });

  const duplicate = engine.evaluateBreakout({
    candle: {
      close: 93.5,
      volume: 350,
      startTime: "2026-04-05T09:22:00+05:30"
    },
    previousCandles: [
      { high: 99, low: 94.5 },
      { high: 102, low: 95.5 },
      { high: 104, low: 97.5 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    }
  });

  assert.ok(first);
  assert.equal(duplicate, null);
});

test("signal engine suppresses long signal when same-symbol long position is already open", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      close: 110,
      volume: 300,
      startTime: "2026-04-05 09:20"
    },
    previousCandles: [
      { high: 100, low: 95 },
      { high: 103, low: 96 },
      { high: 105, low: 98 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    openPositions: [
      { symbol: "SBIN", side: "LONG" }
    ]
  });

  assert.equal(signal, null);
});

test("signal engine suppresses short signal when same-symbol short position is already open", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      close: 94,
      volume: 300,
      startTime: "2026-04-05 09:20"
    },
    previousCandles: [
      { high: 100, low: 95 },
      { high: 103, low: 96 },
      { high: 105, low: 98 }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    openPositions: [
      { symbol: "SBIN", side: "SHORT" }
    ]
  });

  assert.equal(signal, null);
});

test("signal engine can confirm breakout from today's running average even when historical baseline is missing", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      close: 110,
      volume: 180,
      startTime: "2026-04-05T10:00:00+05:30"
    },
    previousCandles: [
      { high: 100, low: 95, volume: 100, startTime: "2026-04-05T09:55:00+05:30" },
      { high: 103, low: 96, volume: 110, startTime: "2026-04-05T09:56:00+05:30" },
      { high: 105, low: 98, volume: 120, startTime: "2026-04-05T09:57:00+05:30" },
      { high: 104, low: 99, volume: 115, startTime: "2026-04-05T09:58:00+05:30" },
      { high: 104.5, low: 99.5, volume: 105, startTime: "2026-04-05T09:59:00+05:30" }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 0
    }
  });

  assert.ok(signal);
  assert.equal(signal.side, "LONG");
  assert.equal(signal.todayAverageVolumePerMin, 110);
  assert.equal(signal.todayVolumeAccelerationRatio, 1.64);
  assert.equal(signal.historicalVolumeRatio, null);
});
