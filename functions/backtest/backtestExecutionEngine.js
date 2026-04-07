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
    const tradeId = `${signal.symbol}-${String(candle.timestamp).replace(/[^0-9]/g, "")}`;
    const target = Number((
      filledEntry + ((filledEntry - riskDecision.stopLoss) * RISK_CONFIG.rewardToRiskRatio)
    ).toFixed(2));
    const trade = {
      tradeId,
      orderId: `backtest-buy-${tradeId}`,
      symbol: signal.symbol,
      side: signal.side,
      requestedEntry: candle.open,
      entry: filledEntry,
      stopLoss: riskDecision.stopLoss,
      target,
      quantity: riskDecision.quantity,
      riskAmount: riskDecision.riskAmount,
      allocatedMargin: riskDecision.allocatedMargin,
      strategy: signal.strategy,
      tradeDate: candle.timestamp.slice(0, 10),
      timestamp: candle.timestamp,
      currentPrice: candle.close,
      unrealizedPnl: calculatePnl({
        side: signal.side,
        entry: filledEntry,
        exitPrice: candle.close,
        quantity: riskDecision.quantity
      }),
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
      const stopTouched = position.side === "LONG" && candle.low <= position.stopLoss;
      const targetTouched = position.side === "LONG" && candle.high >= position.target;

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

      const exitReason = stopTouched ? "stop-loss-hit" : "target-hit";
      const requestedExitPrice = stopTouched ? position.stopLoss : position.target;
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
