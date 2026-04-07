import test from "node:test";
import assert from "node:assert/strict";
import { mockBuyOrder, mockSellOrder } from "../functions/engines/mockOrderEngine.js";

test("mock buy order simulates a filled paper entry with allocated margin", () => {
  const trade = mockBuyOrder({
    signal: {
      symbol: "SBIN",
      side: "LONG",
      close: 100,
      strategy: "Breakout Detection + Volume Confirmation",
      timestamp: "2026-04-05 09:20"
    },
    riskDecision: {
      approved: true,
      stopLoss: 99,
      quantity: 10,
      riskAmount: 10
    }
  });

  assert.ok(trade);
  assert.equal(trade.status, "OPEN");
  assert.equal(trade.quantity, 10);
  assert.ok(trade.entry >= 100);
  assert.equal(trade.allocatedMargin, Number((trade.entry * 10).toFixed(2)));
});

test("mock sell order simulates filled paper exit with directional pnl", () => {
  const closed = mockSellOrder({
    position: {
      tradeId: "SBIN-1",
      symbol: "SBIN",
      side: "LONG",
      entry: 100.05,
      quantity: 10
    },
    exitPrice: 102,
    exitTimestamp: "2026-04-05 09:25",
    closedReason: "target-hit"
  });

  assert.ok(closed);
  assert.equal(closed.status, "CLOSED");
  assert.equal(closed.closedReason, "target-hit");
  assert.ok(closed.exitPrice <= 102);
  assert.ok(closed.pnl > 0);
});

test("mock buy order builds short target below entry", () => {
  const trade = mockBuyOrder({
    signal: {
      symbol: "SBIN",
      side: "SHORT",
      close: 100,
      strategy: "Breakout Detection + Volume Confirmation",
      timestamp: "2026-04-05 09:20"
    },
    riskDecision: {
      approved: true,
      stopLoss: 101,
      quantity: 10,
      riskAmount: 10
    }
  });

  assert.ok(trade);
  assert.equal(trade.side, "SHORT");
  assert.ok(trade.target < trade.entry);
  assert.equal(trade.initialRiskPerUnit, Number(Math.abs(trade.entry - 101).toFixed(2)));
});
