export class BrokerOrderAdapter {
  async placeEntryOrder(_request) {
    throw new Error("BrokerOrderAdapter.placeEntryOrder is not implemented");
  }

  async placeExitOrder(_request) {
    throw new Error("BrokerOrderAdapter.placeExitOrder is not implemented");
  }

  async cancelOrder(_request) {
    throw new Error("BrokerOrderAdapter.cancelOrder is not implemented");
  }

  async fetchOpenOrders() {
    throw new Error("BrokerOrderAdapter.fetchOpenOrders is not implemented");
  }

  async fetchPositions() {
    throw new Error("BrokerOrderAdapter.fetchPositions is not implemented");
  }
}

export function normalizeBrokerOrder(order = {}) {
  return {
    brokerOrderId: order.brokerOrderId ?? order.orderId ?? null,
    brokerStatus: order.brokerStatus ?? order.status ?? "NEW",
    symbol: order.symbol ?? null,
    side: order.side ?? null,
    quantity: Number(order.quantity) || 0,
    filledQuantity: Number(order.filledQuantity) || 0,
    pendingQuantity: Number(order.pendingQuantity) || 0,
    averageFillPrice: Number(order.averageFillPrice) || 0,
    requestedPrice: Number(order.requestedPrice) || null,
    productType: order.productType ?? null,
    variety: order.variety ?? null,
    exchange: order.exchange ?? null,
    raw: order.raw ?? order
  };
}
