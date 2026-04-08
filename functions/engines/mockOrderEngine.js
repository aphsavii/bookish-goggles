import { ORDER_SIMULATION_CONFIG, RISK_CONFIG } from "../../config/tradingConfig.js";

function buildTradeId(symbol, timestamp) {
  return `${symbol}-${String(timestamp).replace(/[^0-9]/g, "")}`;
}

function buildTarget(entry, stopLoss) {
  const riskPerUnit = Math.abs(entry - stopLoss);
  const isShort = stopLoss > entry;
  const target = isShort
    ? entry - (riskPerUnit * RISK_CONFIG.rewardToRiskRatio)
    : entry + (riskPerUnit * RISK_CONFIG.rewardToRiskRatio);
  return Number(target.toFixed(2));
}

function buildSecondTarget(entry, stopLoss) {
  const riskPerUnit = Math.abs(entry - stopLoss);
  const isShort = stopLoss > entry;
  const target = isShort
    ? entry - (riskPerUnit * ORDER_SIMULATION_CONFIG.secondTargetRewardToRiskRatio)
    : entry + (riskPerUnit * ORDER_SIMULATION_CONFIG.secondTargetRewardToRiskRatio);
  return Number(target.toFixed(2));
}

function applySlippage(price, side, slippageBps) {
  const slippageFactor = slippageBps / 10000;
  const direction = side === "LONG" ? 1 : -1;
  return Number((price * (1 + (direction * slippageFactor))).toFixed(2));
}

function calculateDirectionalPnl({ side, entry, exitPrice, quantity }) {
  const direction = side === "LONG" ? 1 : -1;
  return Number((((exitPrice - entry) * direction) * quantity).toFixed(2));
}

// This is the adapter boundary for order placement. It behaves like a broker call
// today, but only creates paper-order payloads so it can be replaced later.
export function mockBuyOrder({ signal, riskDecision }) {
  if (!signal || !riskDecision?.approved) {
    return null;
  }

  const filledEntry = Number.isFinite(Number(riskDecision.expectedEntry))
    ? Number(Number(riskDecision.expectedEntry).toFixed(2))
    : applySlippage(signal.close, signal.side, ORDER_SIMULATION_CONFIG.entrySlippageBps);
  const allocatedMargin = Number((filledEntry * (riskDecision.quantity ?? 1)).toFixed(2));

  return {
    tradeId: buildTradeId(signal.symbol, signal.timestamp),
    orderId: `paper-buy-${buildTradeId(signal.symbol, signal.timestamp)}`,
    symbol: signal.symbol,
    side: signal.side,
    requestedEntry: signal.close,
    entry: filledEntry,
    stopLoss: riskDecision.stopLoss,
    target: buildTarget(filledEntry, riskDecision.stopLoss),
    secondTarget: buildSecondTarget(filledEntry, riskDecision.stopLoss),
    quantity: riskDecision.quantity ?? 1,
    initialQuantity: riskDecision.quantity ?? 1,
    riskAmount: riskDecision.riskAmount,
    allocatedMargin,
    initialRiskPerUnit: Number(Math.abs(filledEntry - riskDecision.stopLoss).toFixed(2)),
    realizedPnl: 0,
    partialExitCount: 0,
    partialExitHistory: [],
    targetActive: true,
    highestPrice: filledEntry,
    lowestPrice: filledEntry,
    strategy: signal.strategy,
    tradeDate: signal.timestamp.slice(0, 10),
    timestamp: signal.timestamp,
    currentPrice: filledEntry,
    unrealizedPnl: 0,
    pnl: 0,
    exitPrice: null,
    exitTimestamp: null,
    closedReason: null,
    brokerStatus: ORDER_SIMULATION_CONFIG.assumedFillStatus,
    status: "OPEN"
  };
}

export function mockSellOrder({ position, exitPrice, exitTimestamp, closedReason }) {
  if (!position || !Number.isFinite(exitPrice)) {
    return null;
  }

  const filledExitPrice = applySlippage(
    exitPrice,
    position.side === "LONG" ? "SHORT" : "LONG",
    ORDER_SIMULATION_CONFIG.exitSlippageBps
  );
  const pnl = calculateDirectionalPnl({
    side: position.side,
    entry: position.entry,
    exitPrice: filledExitPrice,
    quantity: position.quantity
  });

  return {
    ...position,
    orderId: `paper-sell-${position.tradeId}`,
    requestedExitPrice: exitPrice,
    currentPrice: filledExitPrice,
    unrealizedPnl: 0,
    exitPrice: filledExitPrice,
    exitTimestamp,
    pnl: Number(((Number(position.realizedPnl) || 0) + pnl).toFixed(2)),
    closedReason,
    brokerStatus: ORDER_SIMULATION_CONFIG.assumedFillStatus,
    status: "CLOSED"
  };
}
