import test from "node:test";
import assert from "node:assert/strict";
import { SignalEngine } from "../functions/engines/signalEngine.js";

function pad(value) {
  return String(value).padStart(2, "0");
}

function buildTime(index, baseHour = 9, baseMinute = 50) {
  const totalMinutes = baseMinute + index;
  const hour = baseHour + Math.floor(totalMinutes / 60);
  const minute = totalMinutes % 60;
  return `2026-04-05T${pad(hour)}:${pad(minute)}:00+05:30`;
}

function createRisingCandles(count = 14) {
  return Array.from({ length: count }, (_, index) => ({
    open: 100 + index,
    high: 102 + index,
    low: 98 + index,
    close: 101 + index,
    volume: 90 + (index * 5),
    startTime: buildTime(index)
  }));
}

function createFallingCandles(count = 14) {
  return Array.from({ length: count }, (_, index) => ({
    open: 120 - index,
    high: 122 - index,
    low: 118 - index,
    close: 119 - index,
    volume: 90 + (index * 5),
    startTime: buildTime(index)
  }));
}

test("signal engine emits breakout signal with ATR buffer and volume confirmation", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      open: 114.5,
      high: 119,
      low: 114.5,
      close: 118.8,
      volume: 300,
      startTime: buildTime(14)
    },
    previousCandles: createRisingCandles(),
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    marketTrend: "up"
  });

  assert.ok(signal);
  assert.equal(signal.symbol, "SBIN");
  assert.equal(signal.side, "LONG");
  assert.equal(signal.breakoutLevel, 115);
  assert.equal(signal.triggerLevel, 115.8);
  assert.ok(["strong-breakout", "retest-hold"].includes(signal.setupType));
  assert.equal(signal.signalModel, "core");
  assert.equal(signal.historicalVolumeRatio, 3);
  assert.equal(signal.atr, 4);
  assert.equal(signal.volumeConfirmationBasis, "session");
});

test("signal engine rejects a weak breakout that does not clear the ATR buffer", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      open: 114.9,
      high: 115.7,
      low: 114.6,
      close: 115.7,
      volume: 300,
      startTime: buildTime(14)
    },
    previousCandles: createRisingCandles(),
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    marketTrend: "up"
  });

  assert.equal(signal, null);
});

test("signal engine suppresses duplicate breakout signals inside cooldown window", () => {
  const engine = new SignalEngine();
  const previousCandles = createRisingCandles();

  const first = engine.evaluateBreakout({
    candle: {
      open: 114.5,
      high: 119,
      low: 114.2,
      close: 118.8,
      volume: 300,
      startTime: buildTime(14)
    },
    previousCandles,
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    marketTrend: "up"
  });

  const duplicate = engine.evaluateBreakout({
    candle: {
      open: 116.5,
      high: 120,
      low: 116.2,
      close: 119.5,
      volume: 320,
      startTime: buildTime(16)
    },
    previousCandles: [
      ...previousCandles.slice(2),
      { open: 114.5, high: 119, low: 114.2, close: 118.8, volume: 300, startTime: buildTime(14) },
      { open: 118.8, high: 119.2, low: 117.8, close: 118.4, volume: 180, startTime: buildTime(15) }
    ],
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    marketTrend: "up"
  });

  assert.ok(first);
  assert.equal(duplicate, null);
});

test("signal engine emits breakdown short signal with volume confirmation", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      open: 106.5,
      high: 106.8,
      low: 88.2,
      close: 88.6,
      volume: 300,
      startTime: buildTime(14)
    },
    previousCandles: createFallingCandles(),
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    marketTrend: "down"
  });

  assert.ok(signal);
  assert.equal(signal.symbol, "SBIN");
  assert.equal(signal.side, "SHORT");
  assert.equal(signal.supportLevel, 105);
  assert.equal(signal.triggerLevel, 104.2);
});

test("signal engine suppresses short signal when same-symbol short position is already open", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateBreakout({
    candle: {
      open: 106.5,
      high: 106.8,
      low: 88.2,
      close: 88.6,
      volume: 300,
      startTime: buildTime(14)
    },
    previousCandles: createFallingCandles(),
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    openPositions: [
      { symbol: "SBIN", side: "SHORT" }
    ],
    marketTrend: "down"
  });

  assert.equal(signal, null);
});

test("signal engine can confirm breakout from a preloaded time-of-day volume profile", () => {
  const engine = new SignalEngine();
  const previousCandles = Array.from({ length: 14 }, (_, index) => ({
    open: 100 + index,
    high: 101 + index,
    low: 99 + index,
    close: 100.5 + index,
    volume: 50 + index,
    startTime: buildTime(index, 10, 0)
  }));

  const signal = engine.evaluateBreakout({
    candle: {
      open: 113.5,
      high: 117.8,
      low: 113.2,
      close: 117.2,
      volume: 120,
      startTime: buildTime(14, 10, 0)
    },
    previousCandles,
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 0,
      intradayVolumeProfile: {
        "10:14": {
          totalVolume: 300,
          sampleCount: 5,
          averageVolumePerMin: 60
        }
      }
    },
    marketTrend: "up"
  });

  assert.ok(signal);
  assert.equal(signal.side, "LONG");
  assert.equal(signal.volumeConfirmationBasis, "historical-profile");
  assert.equal(signal.timeOfDayAverageVolumePerMin, 60);
  assert.equal(signal.timeOfDayVolumeRatio, 2);
  assert.equal(signal.todayAverageVolumePerMin, 56.5);
});

test("signal engine confirmation path remains available for stricter entries", () => {
  const engine = new SignalEngine();
  const signal = engine.evaluateConfirmedBreakout({
    candle: {
      open: 114.5,
      high: 119,
      low: 114.2,
      close: 118.8,
      volume: 300,
      startTime: buildTime(14)
    },
    previousCandles: createRisingCandles(),
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100
    },
    marketTrend: "up"
  });

  assert.ok(signal);
  assert.equal(signal.signalModel, "confirmation");
  assert.ok(["strong-breakout", "retest-hold"].includes(signal.setupType));
});
