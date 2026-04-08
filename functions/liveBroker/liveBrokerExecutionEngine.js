import { getIstTimestamp } from "../../utils/time.js";
import { BrokerOrderAdapter, normalizeBrokerOrder } from "./brokerOrderAdapter.js";
import { LiveBrokerStateStore } from "./liveBrokerStateStore.js";

function buildIntentId(symbol, timestamp = getIstTimestamp()) {
  return `intent-${symbol}-${String(timestamp).replace(/[^0-9]/g, "")}`;
}

function buildEntryOrderRequest({ signal, riskDecision, productType = "INTRADAY" }) {
  return {
    symbol: signal.symbol,
    side: signal.side,
    quantity: riskDecision.quantity,
    requestedPrice: riskDecision.expectedEntry,
    stopLoss: riskDecision.stopLoss,
    productType,
    strategy: signal.strategy,
    signal,
    riskDecision
  };
}

export class LiveBrokerExecutionEngine {
  constructor({
    brokerAdapter,
    stateStore = new LiveBrokerStateStore(),
    productType = "INTRADAY"
  } = {}) {
    if (!(brokerAdapter instanceof BrokerOrderAdapter)) {
      throw new Error("LiveBrokerExecutionEngine requires a BrokerOrderAdapter instance");
    }

    this.brokerAdapter = brokerAdapter;
    this.stateStore = stateStore;
    this.productType = productType;
  }

  async submitEntry({ signal, riskDecision, timestamp = getIstTimestamp() }) {
    if (!signal || !riskDecision?.approved) {
      return null;
    }

    const intent = {
      intentId: buildIntentId(signal.symbol, timestamp),
      type: "ENTRY",
      symbol: signal.symbol,
      side: signal.side,
      timestamp,
      signal,
      riskDecision,
      status: "PENDING_BROKER_ACK"
    };

    this.stateStore.saveOrderIntent(intent);

    const brokerOrder = await this.brokerAdapter.placeEntryOrder(
      buildEntryOrderRequest({
        signal,
        riskDecision,
        productType: this.productType
      })
    );

    const normalizedOrder = normalizeBrokerOrder(brokerOrder);
    this.stateStore.upsertOrder({
      ...normalizedOrder,
      intentId: intent.intentId,
      type: "ENTRY",
      stopLoss: riskDecision.stopLoss,
      target: signal.target ?? null,
      secondTarget: signal.secondTarget ?? null,
      timestamp
    });
    this.stateStore.appendEvent({
      type: "broker-entry-submitted",
      symbol: signal.symbol,
      brokerOrderId: normalizedOrder.brokerOrderId,
      timestamp
    });

    return normalizedOrder;
  }

  async submitExit({
    symbol,
    side,
    quantity,
    exitReason,
    requestedPrice = null,
    timestamp = getIstTimestamp()
  }) {
    const brokerOrder = await this.brokerAdapter.placeExitOrder({
      symbol,
      side,
      quantity,
      requestedPrice,
      productType: this.productType,
      exitReason
    });

    const normalizedOrder = normalizeBrokerOrder(brokerOrder);
    this.stateStore.upsertOrder({
      ...normalizedOrder,
      type: "EXIT",
      exitReason,
      timestamp
    });
    this.stateStore.appendEvent({
      type: "broker-exit-submitted",
      symbol,
      brokerOrderId: normalizedOrder.brokerOrderId,
      exitReason,
      timestamp
    });

    return normalizedOrder;
  }

  ingestOrderUpdate(update = {}) {
    const normalizedOrder = normalizeBrokerOrder(update);
    if (!normalizedOrder.brokerOrderId) {
      return null;
    }

    this.stateStore.upsertOrder(normalizedOrder);
    this.stateStore.appendEvent({
      type: "broker-order-update",
      brokerOrderId: normalizedOrder.brokerOrderId,
      brokerStatus: normalizedOrder.brokerStatus,
      symbol: normalizedOrder.symbol,
      timestamp: getIstTimestamp()
    });

    return normalizedOrder;
  }

  replaceBrokerPositions(positions = []) {
    for (const position of this.stateStore.getPositions()) {
      this.stateStore.deletePosition(position.symbol);
    }

    for (const position of positions) {
      this.stateStore.upsertPosition(position);
    }

    return this.stateStore.getPositions();
  }

  async reconcileBrokerState() {
    const [openOrders, positions] = await Promise.all([
      this.brokerAdapter.fetchOpenOrders(),
      this.brokerAdapter.fetchPositions()
    ]);

    for (const order of openOrders ?? []) {
      this.stateStore.upsertOrder(normalizeBrokerOrder(order));
    }

    this.replaceBrokerPositions(positions ?? []);
    this.stateStore.appendEvent({
      type: "broker-reconcile",
      orderCount: (openOrders ?? []).length,
      positionCount: (positions ?? []).length,
      timestamp: getIstTimestamp()
    });

    return this.stateStore.getStateSnapshot();
  }

  getOpenPositions() {
    return this.stateStore.getPositions();
  }

  getOrders() {
    return this.stateStore.getOrders();
  }

  getStateSnapshot() {
    return this.stateStore.getStateSnapshot();
  }
}
