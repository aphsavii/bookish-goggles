import test from "node:test";
import assert from "node:assert/strict";
import { RiskControlEngine } from "../functions/engines/riskControlEngine.js";

function createRiskConfig(overrides = {}) {
  return {
    maxMarginPerTrade: 25000,
    maxTradesPerDay: 3,
    maxOpenPositions: 3,
    maxLossPerTrade: 1000,
    maxLossPerDay: 3000,
    availableMargin: 100000,
    ...overrides
  };
}

function createSignal() {
  return {
    symbol: "SBIN",
    side: "LONG",
    close: 100,
    atr: 4,
    timestamp: "2026-04-05 10:00"
  };
}

function createShortSignal() {
  return {
    symbol: "SBIN",
    side: "SHORT",
    close: 100,
    atr: 4,
    timestamp: "2026-04-05 10:00"
  };
}

test("risk control approves a valid signal", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: createSignal(),
    openPositions: [],
    marketTrend: "up",
    riskConfig: createRiskConfig(),
    allTrades: []
  });

  assert.equal(result.approved, true);
  assert.equal(result.stopLoss, 94);
  assert.equal(result.quantity, 165);
  assert.equal(result.allocatedMargin, 16508.25);
  assert.equal(result.expectedEntry, 100.05);
});

test("risk control blocks duplicate open position", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: createSignal(),
    openPositions: [{ symbol: "SBIN" }],
    marketTrend: "up",
    riskConfig: createRiskConfig(),
    allTrades: []
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "duplicate-open-position");
});

test("risk control blocks long signals when market trend is down", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: createSignal(),
    openPositions: [],
    marketTrend: "down",
    riskConfig: createRiskConfig(),
    allTrades: []
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "market-trend-filter");
});

test("risk control blocks when quantity falls below one share", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: createSignal(),
    openPositions: [],
    marketTrend: "up",
    riskConfig: createRiskConfig({
      maxMarginPerTrade: 50
    }),
    allTrades: []
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "quantity-too-low");
});

test("risk control approves a valid short signal with stop loss above entry", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: createShortSignal(),
    openPositions: [],
    marketTrend: "down",
    riskConfig: createRiskConfig(),
    allTrades: []
  });

  assert.equal(result.approved, true);
  assert.equal(result.stopLoss, 106);
  assert.equal(result.quantity, 165);
  assert.equal(result.expectedEntry, 99.95);
});

test("risk control blocks new entries after session cutoff", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: {
      ...createSignal(),
      timestamp: "2026-04-05 15:06:00"
    },
    openPositions: [],
    marketTrend: "up",
    riskConfig: createRiskConfig(),
    allTrades: []
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "entry-cutoff-passed");
});

test("risk control blocks new entries before session start gate", () => {
  const engine = new RiskControlEngine();
  const result = engine.validateSignal({
    signal: {
      ...createSignal(),
      timestamp: "2026-04-05 09:49:00"
    },
    openPositions: [],
    marketTrend: "up",
    riskConfig: createRiskConfig(),
    allTrades: []
  });

  assert.equal(result.approved, false);
  assert.equal(result.reason, "entry-start-not-reached");
});
