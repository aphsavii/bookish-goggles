import test from "node:test";
import assert from "node:assert/strict";
import { ExecutionEngine, updateTrailingStop } from "../functions/engines/executionEngine.js";

test("trailing stop moves long position to breakeven at 0.5R and then locks 0.5R at 1R", () => {
  const position = {
    side: "LONG",
    entry: 100,
    stopLoss: 99,
    initialRiskPerUnit: 1,
    highestPrice: 100,
    lowestPrice: 100
  };

  let changed = updateTrailingStop(position, 100.5);
  assert.equal(changed, true);
  assert.equal(position.stopLoss, 100);

  changed = updateTrailingStop(position, 101);
  assert.equal(changed, true);
  assert.equal(position.stopLoss, 100.5);
});

test("trailing stop moves short position to breakeven at 0.5R and then locks 0.5R at 1R", () => {
  const position = {
    side: "SHORT",
    entry: 100,
    stopLoss: 101,
    initialRiskPerUnit: 1,
    highestPrice: 100,
    lowestPrice: 100
  };

  let changed = updateTrailingStop(position, 99.5);
  assert.equal(changed, true);
  assert.equal(position.stopLoss, 100);

  changed = updateTrailingStop(position, 99);
  assert.equal(changed, true);
  assert.equal(position.stopLoss, 99.5);
});

test("trailing stop continues above breakeven for legacy long positions without stored initial risk", () => {
  const position = {
    side: "LONG",
    entry: 253.83,
    stopLoss: 253.83,
    target: 259.17,
    quantity: 98,
    riskAmount: 248.92,
    highestPrice: 256.52,
    lowestPrice: 253.83
  };

  const changed = updateTrailingStop(position, 258.89);
  assert.equal(changed, true);
  assert.equal(position.stopLoss, 257.62);
});

test("trailing stop continues below breakeven for legacy short positions without stored initial risk", () => {
  const position = {
    side: "SHORT",
    entry: 100,
    stopLoss: 100,
    target: 98,
    quantity: 100,
    riskAmount: 100,
    highestPrice: 100,
    lowestPrice: 98.6
  };

  const changed = updateTrailingStop(position, 98.4);
  assert.equal(changed, true);
  assert.equal(position.stopLoss, 98.9);
});

test("execution engine syncs open position updates into paper trades on live ticks", () => {
  const engine = new ExecutionEngine();
  const baseTrade = {
    tradeId: "TEST-LIVE-1",
    symbol: "TESTLIVE",
    side: "LONG",
    entry: 100,
    stopLoss: 99,
    target: 102,
    quantity: 10,
    riskAmount: 10,
    allocatedMargin: 1000,
    strategy: "test",
    tradeDate: "2026-04-06",
    timestamp: "2026-04-06 12:00",
    currentPrice: 100,
    unrealizedPnl: 0,
    status: "OPEN",
    highestPrice: 100,
    lowestPrice: 100,
    initialRiskPerUnit: 1
  };

  engine.paperTrades = [{ ...baseTrade }];
  engine.openPositions = [{ ...baseTrade }];

  const result = engine.updateMarketPrice({
    symbol: "TESTLIVE",
    ltp: 101,
    timestamp: "2026-04-06 12:01"
  });

  assert.equal(result.positionUpdated, true);
  assert.equal(result.closedTrade, null);
  assert.equal(engine.openPositions[0].currentPrice, 101);
  assert.equal(engine.openPositions[0].stopLoss, 100.5);
  assert.equal(engine.paperTrades[0].currentPrice, 101);
  assert.equal(engine.paperTrades[0].unrealizedPnl, 10);
  assert.equal(engine.paperTrades[0].stopLoss, 100.5);
});

test("execution engine can square off all open positions with live prices", () => {
  const engine = new ExecutionEngine();
  engine.paperTrades = [{
    tradeId: "TEST-SQ-1",
    symbol: "TESTSQ",
    side: "LONG",
    entry: 100,
    stopLoss: 99,
    target: 102,
    quantity: 10,
    riskAmount: 10,
    allocatedMargin: 1000,
    strategy: "test",
    tradeDate: "2026-04-06",
    timestamp: "2026-04-06 12:00",
    currentPrice: 100,
    unrealizedPnl: 0,
    status: "OPEN"
  }];
  engine.openPositions = [{ ...engine.paperTrades[0] }];

  const closedTrades = engine.squareOffOpenPositions({
    exitTimestamp: "2026-04-06 15:09:00",
    getExitPrice: (symbol) => symbol === "TESTSQ" ? 101 : null,
    closedReason: "session-square-off"
  });

  assert.equal(closedTrades.length, 1);
  assert.equal(closedTrades[0].status, "CLOSED");
  assert.equal(closedTrades[0].closedReason, "session-square-off");
  assert.equal(engine.openPositions.length, 0);
  assert.equal(engine.paperTrades[0].status, "CLOSED");
});
