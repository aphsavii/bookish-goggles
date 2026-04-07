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
    timestamp: "2026-04-05 09:20"
  };
}

function createShortSignal() {
  return {
    symbol: "SBIN",
    side: "SHORT",
    close: 100,
    timestamp: "2026-04-05 09:20"
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
  assert.equal(result.quantity, 250);
  assert.equal(result.allocatedMargin, 25000);
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
  assert.equal(result.stopLoss, 101);
  assert.equal(result.quantity, 250);
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
