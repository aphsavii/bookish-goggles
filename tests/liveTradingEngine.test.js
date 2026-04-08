import test from "node:test";
import assert from "node:assert/strict";
import { BrokerOrderAdapter } from "../functions/liveBroker/brokerOrderAdapter.js";
import { LiveBrokerExecutionEngine } from "../functions/liveBroker/liveBrokerExecutionEngine.js";
import { LiveTradingEngine } from "../functions/liveBroker/liveTradingEngine.js";

class FakeBrokerAdapter extends BrokerOrderAdapter {
  async placeEntryOrder(request) {
    return {
      brokerOrderId: "BROKER-LIVE-ENTRY-1",
      brokerStatus: "OPEN",
      symbol: request.symbol,
      side: request.side,
      quantity: request.quantity,
      requestedPrice: request.requestedPrice
    };
  }

  async placeExitOrder() {
    return {
      brokerOrderId: "BROKER-LIVE-EXIT-1",
      brokerStatus: "OPEN"
    };
  }

  async cancelOrder() {
    return { cancelled: true };
  }

  async fetchOpenOrders() {
    return [];
  }

  async fetchPositions() {
    return [];
  }
}

test("live trading engine reuses signal and risk engines before submitting broker entry", async () => {
  const executionEngine = new LiveBrokerExecutionEngine({
    brokerAdapter: new FakeBrokerAdapter()
  });
  const tradingEngine = new LiveTradingEngine({ executionEngine });

  const previousCandles = Array.from({ length: 14 }, (_, index) => ({
    startTime: `2026-04-08T10:${String(index).padStart(2, "0")}:00+05:30`,
    open: 100 + index,
    high: 102 + index,
    low: 98 + index,
    close: 101 + index,
    volume: 100 + (index * 5)
  }));

  const result = await tradingEngine.processClosedCandle({
    candle: {
      symbol: "SBIN",
      startTime: "2026-04-08T10:14:00+05:30",
      bucket: "2026-04-08T10:14",
      open: 114.5,
      high: 119,
      low: 114.2,
      close: 118.8,
      volume: 300
    },
    previousCandles,
    instrument: {
      symbol: "SBIN",
      averageHistoricalVolPerMin: 100,
      intradayVolumeProfile: {}
    },
    marketTrend: "up",
    riskConfig: {
      totalMarginAvailable: 100000,
      availableMargin: 100000,
      maxMarginPerTrade: 25000,
      maxTradesPerDay: 15,
      maxLossPerTrade: 1000,
      maxLossPerDay: 3000,
      stopLossAtrMultiplier: 1.5,
      maxOpenPositions: 3
    },
    allTrades: []
  });

  assert.ok(result.signal);
  assert.equal(result.riskDecision.approved, true);
  assert.ok(result.order);
  assert.equal(executionEngine.getOrders().length, 1);
});
