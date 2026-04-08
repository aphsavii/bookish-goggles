import { ORDER_SIMULATION_CONFIG, RISK_CONFIG } from "../../config/tradingConfig.js";

function applySlippage(price, side, slippageBps) {
  const slippageFactor = slippageBps / 10000;
  const direction = side === "LONG" ? 1 : -1;
  return Number((price * (1 + (direction * slippageFactor))).toFixed(2));
}

function calculatePnl({ side, entry, exitPrice, quantity }) {
  const direction = side === "LONG" ? 1 : -1;
  return Number((((exitPrice - entry) * direction) * quantity).toFixed(2));
}

function getPartialExitQuantity(quantity, fraction = ORDER_SIMULATION_CONFIG.targetPartialExitFraction ?? 0.5) {
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity <= 1) {
    return 0;
  }

  const partialQuantity = Math.floor(numericQuantity * fraction);
  return Math.min(Math.max(partialQuantity, 1), numericQuantity - 1);
}

function buildTarget(entry, stopLoss, rewardToRiskRatio) {
  const riskPerUnit = Math.abs(entry - stopLoss);
  const isShort = stopLoss > entry;
  const target = isShort
    ? entry - (riskPerUnit * rewardToRiskRatio)
    : entry + (riskPerUnit * rewardToRiskRatio);
  return Number(target.toFixed(2));
}

function getActiveTarget(position) {
  const hasScaledOut = Number(position.partialExitCount || 0) > 0;
  return hasScaledOut ? Number(position.secondTarget) : Number(position.target);
}

export class BacktestExecutionEngine {
  constructor() {
    this.trades = [];
    this.openPositions = [];
    this.pendingEntry = null;
  }

  queueEntry({ signal, riskDecision }) {
    if (!signal || !riskDecision?.approved || this.pendingEntry) {
      return null;
    }

    this.pendingEntry = { signal, riskDecision };
    return this.pendingEntry;
  }

  fillPendingEntry(candle) {
    if (!this.pendingEntry) {
      return null;
    }

    const { signal, riskDecision } = this.pendingEntry;
    const filledEntry = applySlippage(
      candle.open,
      signal.side,
      ORDER_SIMULATION_CONFIG.entrySlippageBps
    );
    const effectiveRiskPerUnit = Number(Math.abs(filledEntry - riskDecision.stopLoss).toFixed(2));
    const quantityByRisk = effectiveRiskPerUnit > 0 && Number.isFinite(riskDecision.maxLossPerTrade)
      ? Math.floor(riskDecision.maxLossPerTrade / effectiveRiskPerUnit)
      : riskDecision.quantity;
    const quantityByMargin = Number.isFinite(riskDecision.maxMarginPerTrade) && filledEntry > 0
      ? Math.floor(riskDecision.maxMarginPerTrade / filledEntry)
      : riskDecision.quantity;
    const quantity = Math.max(Math.min(riskDecision.quantity, quantityByRisk, quantityByMargin), 0);

    if (quantity < 1) {
      this.pendingEntry = null;
      return null;
    }

    const tradeId = `${signal.symbol}-${String(candle.timestamp).replace(/[^0-9]/g, "")}`;
    const target = buildTarget(filledEntry, riskDecision.stopLoss, RISK_CONFIG.rewardToRiskRatio);
    const trade = {
      tradeId,
      orderId: `backtest-buy-${tradeId}`,
      symbol: signal.symbol,
      side: signal.side,
      requestedEntry: candle.open,
      entry: filledEntry,
      stopLoss: riskDecision.stopLoss,
      target,
      secondTarget: buildTarget(
        filledEntry,
        riskDecision.stopLoss,
        ORDER_SIMULATION_CONFIG.secondTargetRewardToRiskRatio
      ),
      quantity,
      initialQuantity: quantity,
      riskAmount: Number((effectiveRiskPerUnit * quantity).toFixed(2)),
      allocatedMargin: Number((filledEntry * quantity).toFixed(2)),
      strategy: signal.strategy,
      tradeDate: candle.timestamp.slice(0, 10),
      timestamp: candle.timestamp,
      currentPrice: candle.close,
      unrealizedPnl: calculatePnl({
        side: signal.side,
        entry: filledEntry,
        exitPrice: candle.close,
        quantity
      }),
      realizedPnl: 0,
      partialExitCount: 0,
      partialExitHistory: [],
      targetActive: true,
      pnl: 0,
      exitPrice: null,
      exitTimestamp: null,
      requestedExitPrice: null,
      closedReason: null,
      brokerStatus: ORDER_SIMULATION_CONFIG.assumedFillStatus,
      status: "OPEN"
    };

    this.openPositions.push(trade);
    this.trades.push(trade);
    this.pendingEntry = null;
    return trade;
  }

  updateOpenPositions(candle) {
    const closedTrades = [];

    this.openPositions = this.openPositions.filter((position) => {
      const activeTarget = getActiveTarget(position);
      const stopTouched = position.side === "LONG"
        ? candle.low <= position.stopLoss
        : candle.high >= position.stopLoss;
      const targetTouched = position.targetActive !== false && (position.side === "LONG"
        ? candle.high >= activeTarget
        : candle.low <= activeTarget);

      if (!stopTouched && !targetTouched) {
        position.currentPrice = candle.close;
        position.unrealizedPnl = calculatePnl({
          side: position.side,
          entry: position.entry,
          exitPrice: candle.close,
          quantity: position.quantity
        });
        return true;
      }

      if (targetTouched && Number(position.partialExitCount || 0) === 0) {
        const partialQuantity = getPartialExitQuantity(position.quantity);
        if (partialQuantity > 0) {
          const requestedExitPrice = position.target;
          const filledExitPrice = applySlippage(
            requestedExitPrice,
            position.side === "LONG" ? "SHORT" : "LONG",
            ORDER_SIMULATION_CONFIG.exitSlippageBps
          );
          const realizedPnl = calculatePnl({
            side: position.side,
            entry: position.entry,
            exitPrice: filledExitPrice,
            quantity: partialQuantity
          });

          position.quantity -= partialQuantity;
          position.allocatedMargin = Number((position.entry * position.quantity).toFixed(2));
          position.riskAmount = Number((Math.abs(position.entry - position.stopLoss) * position.quantity).toFixed(2));
          position.realizedPnl = Number(((Number(position.realizedPnl) || 0) + realizedPnl).toFixed(2));
          position.partialExitCount = Number(position.partialExitCount || 0) + 1;
          position.partialExitHistory = [
            ...(Array.isArray(position.partialExitHistory) ? position.partialExitHistory : []),
            {
              quantity: partialQuantity,
              exitPrice: filledExitPrice,
              exitTimestamp: candle.timestamp,
              pnl: realizedPnl,
              reason: "target-partial-exit"
            }
          ];
          position.stopLoss = position.entry;
          position.targetActive = Number.isFinite(Number(position.secondTarget));
          position.currentPrice = candle.close;
          position.unrealizedPnl = calculatePnl({
            side: position.side,
            entry: position.entry,
            exitPrice: candle.close,
            quantity: position.quantity
          });

          const tradeIndex = this.trades.findIndex((trade) => trade.tradeId === position.tradeId);
          if (tradeIndex !== -1) {
            this.trades[tradeIndex] = { ...position };
          }

          return true;
        }
      }

      const exitReason = stopTouched
        ? "stop-loss-hit"
        : Number(position.partialExitCount || 0) > 0 ? "second-target-hit" : "target-hit";
      const requestedExitPrice = stopTouched ? position.stopLoss : activeTarget;
      const filledExitPrice = applySlippage(
        requestedExitPrice,
        position.side === "LONG" ? "SHORT" : "LONG",
        ORDER_SIMULATION_CONFIG.exitSlippageBps
      );

      const closedTrade = {
        ...position,
        requestedExitPrice,
        exitPrice: filledExitPrice,
        exitTimestamp: candle.timestamp,
        currentPrice: filledExitPrice,
        unrealizedPnl: 0,
        realizedPnl: Number(position.realizedPnl || 0),
        pnl: calculatePnl({
          side: position.side,
          entry: position.entry,
          exitPrice: filledExitPrice,
          quantity: position.quantity
        }),
        closedReason: exitReason,
        brokerStatus: ORDER_SIMULATION_CONFIG.assumedFillStatus,
        status: "CLOSED"
      };

      const tradeIndex = this.trades.findIndex((trade) => trade.tradeId === closedTrade.tradeId);
      if (tradeIndex !== -1) {
        closedTrade.pnl = Number(((Number(position.realizedPnl) || 0) + closedTrade.pnl).toFixed(2));
        this.trades[tradeIndex] = closedTrade;
      }
      closedTrades.push(closedTrade);
      return false;
    });

    return closedTrades;
  }

  forceCloseAll(lastCandle) {
    return [...this.openPositions].map((position) => {
      const closedTrade = {
        ...position,
        requestedExitPrice: lastCandle.close,
        exitPrice: applySlippage(
          lastCandle.close,
          position.side === "LONG" ? "SHORT" : "LONG",
          ORDER_SIMULATION_CONFIG.exitSlippageBps
        ),
        exitTimestamp: lastCandle.timestamp,
        currentPrice: lastCandle.close,
        unrealizedPnl: 0,
        realizedPnl: Number(position.realizedPnl || 0),
        closedReason: "end-of-backtest",
        brokerStatus: ORDER_SIMULATION_CONFIG.assumedFillStatus,
        status: "CLOSED"
      };

      closedTrade.pnl = calculatePnl({
        side: closedTrade.side,
        entry: closedTrade.entry,
        exitPrice: closedTrade.exitPrice,
        quantity: closedTrade.quantity
      });
      closedTrade.pnl = Number(((Number(position.realizedPnl) || 0) + closedTrade.pnl).toFixed(2));

      const tradeIndex = this.trades.findIndex((trade) => trade.tradeId === closedTrade.tradeId);
      if (tradeIndex !== -1) {
        this.trades[tradeIndex] = closedTrade;
      }

      return closedTrade;
    });
  }

  clearOpenPositions() {
    this.openPositions = [];
    this.pendingEntry = null;
  }

  getOpenPositions() {
    return [...this.openPositions];
  }

  getTrades() {
    return [...this.trades];
  }
}
