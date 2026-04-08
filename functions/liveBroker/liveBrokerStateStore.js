function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

export class LiveBrokerStateStore {
  constructor() {
    this.orderIntents = [];
    this.orders = new Map();
    this.positions = new Map();
    this.events = [];
  }

  saveOrderIntent(intent) {
    this.orderIntents.push(clone(intent));
    return intent;
  }

  upsertOrder(order) {
    if (!order?.brokerOrderId) {
      return null;
    }

    const next = clone(order);
    this.orders.set(order.brokerOrderId, next);
    return next;
  }

  upsertPosition(position) {
    if (!position?.symbol) {
      return null;
    }

    const next = clone(position);
    this.positions.set(position.symbol, next);
    return next;
  }

  deletePosition(symbol) {
    this.positions.delete(symbol);
  }

  appendEvent(event) {
    this.events.push(clone(event));
    if (this.events.length > 500) {
      this.events.shift();
    }
  }

  getOrderIntents() {
    return this.orderIntents.map(clone);
  }

  getOrders() {
    return [...this.orders.values()].map(clone);
  }

  getPositions() {
    return [...this.positions.values()].map(clone);
  }

  getPosition(symbol) {
    const position = this.positions.get(symbol);
    return position ? clone(position) : null;
  }

  getStateSnapshot() {
    return {
      orderIntents: this.getOrderIntents(),
      orders: this.getOrders(),
      positions: this.getPositions(),
      events: this.events.map(clone)
    };
  }
}
