import test from "node:test";
import assert from "node:assert/strict";
import { BrokerOrderAdapter } from "../functions/liveBroker/brokerOrderAdapter.js";
import { LiveBrokerExecutionEngine } from "../functions/liveBroker/liveBrokerExecutionEngine.js";

class FakeBrokerAdapter extends BrokerOrderAdapter {
  constructor() {
    super();
    this.entryRequests = [];
    this.exitRequests = [];
  }

  async placeEntryOrder(request) {
    this.entryRequests.push(request);
    return {
      brokerOrderId: "BROKER-ENTRY-1",
      brokerStatus: "OPEN",
      symbol: request.symbol,
      side: request.side,
      quantity: request.quantity,
      requestedPrice: request.requestedPrice
    };
  }

  async placeExitOrder(request) {
    this.exitRequests.push(request);
    return {
      brokerOrderId: "BROKER-EXIT-1",
      brokerStatus: "OPEN",
      symbol: request.symbol,
      side: request.side,
      quantity: request.quantity,
      requestedPrice: request.requestedPrice
    };
  }

  async cancelOrder() {
    return { cancelled: true };
  }

  async fetchOpenOrders() {
    return [{
      brokerOrderId: "BROKER-ENTRY-2",
      brokerStatus: "OPEN",
      symbol: "SBIN",
      side: "LONG",
      quantity: 10
    }];
  }

  async fetchPositions() {
    return [{
      symbol: "SBIN",
      side: "LONG",
      quantity: 10,
      averageFillPrice: 101.2
    }];
  }
}

test("live broker execution engine submits entry orders without touching paper engine", async () => {
  const brokerAdapter = new FakeBrokerAdapter();
  const engine = new LiveBrokerExecutionEngine({ brokerAdapter });

  const order = await engine.submitEntry({
    signal: {
      symbol: "SBIN",
      side: "LONG",
      strategy: "Breakout",
      timestamp: "2026-04-08T10:00:00+05:30"
    },
    riskDecision: {
      approved: true,
      quantity: 25,
      expectedEntry: 101.5,
      stopLoss: 99.8
    },
    timestamp: "2026-04-08T10:00:00+05:30"
  });

  assert.equal(order.brokerOrderId, "BROKER-ENTRY-1");
  assert.equal(brokerAdapter.entryRequests.length, 1);
  assert.equal(brokerAdapter.entryRequests[0].productType, "INTRADAY");
  assert.equal(engine.getOrders().length, 1);
});

test("live broker execution engine reconciles broker orders and positions", async () => {
  const brokerAdapter = new FakeBrokerAdapter();
  const engine = new LiveBrokerExecutionEngine({ brokerAdapter });

  const snapshot = await engine.reconcileBrokerState();

  assert.equal(snapshot.orders.length, 1);
  assert.equal(snapshot.positions.length, 1);
  assert.equal(snapshot.positions[0].symbol, "SBIN");
});
