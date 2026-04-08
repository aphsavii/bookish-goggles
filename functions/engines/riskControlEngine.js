import { RISK_CONFIG } from "../../config/tradingConfig.js";
import { getIstDate, isIstTimeOnOrAfter } from "../../utils/time.js";
import { SESSION_CONFIG } from "../../config/tradingConfig.js";

class RiskControlEngine {
  validateSignal({ signal, openPositions, marketTrend, riskConfig, allTrades }) {
    if (!signal) {
      return { approved: false, reason: "missing-signal" };
    }

    const stopLoss = signal.side === "SHORT"
      ? Number((signal.close * (1 + RISK_CONFIG.stopLossPct / 100)).toFixed(2))
      : Number((signal.close * (1 - RISK_CONFIG.stopLossPct / 100)).toFixed(2));
    const riskPerUnit = Number((Math.abs(signal.close - stopLoss)).toFixed(2));
    const maxMarginPerTrade = Math.min(
      Number(riskConfig.maxMarginPerTrade) || 0,
      Number(riskConfig.availableMargin) || 0
    );
    const quantityByMargin = riskPerUnit > 0
      ? Math.floor(maxMarginPerTrade / signal.close)
      : 0;
    const quantityByRisk = riskPerUnit > 0
      ? Math.floor((Number(riskConfig.maxLossPerTrade) || 0) / riskPerUnit)
      : 0;
    const quantity = Math.max(Math.min(quantityByMargin, quantityByRisk), 0);
    const allocatedMargin = Number((signal.close * quantity).toFixed(2));
    const riskAmount = Number((riskPerUnit * quantity).toFixed(2));
    const today = getIstDate();
    const todaysTrades = allTrades.filter((trade) => trade.tradeDate === today);
    const todaysRisk = todaysTrades.reduce((sum, trade) => sum + (Number(trade.riskAmount) || 0), 0);
    const hasOpenPosition = openPositions.some((position) => position.symbol === signal.symbol);
    const signalTimestamp = signal.timestamp ?? new Date();

    if (riskPerUnit <= 0) {
      return { approved: false, reason: "invalid-stop-loss" };
    }

    if (!isIstTimeOnOrAfter(SESSION_CONFIG.noNewEntriesBefore, signalTimestamp)) {
      return { approved: false, reason: "entry-start-not-reached" };
    }

    if (isIstTimeOnOrAfter(SESSION_CONFIG.noNewEntriesAfter, signalTimestamp)) {
      return { approved: false, reason: "entry-cutoff-passed" };
    }

    if (quantity < 1) {
      return { approved: false, reason: "quantity-too-low" };
    }

    if (todaysTrades.length >= riskConfig.maxTradesPerDay) {
      return { approved: false, reason: "max-trades-per-day" };
    }

    if (openPositions.length >= riskConfig.maxOpenPositions) {
      return { approved: false, reason: "max-open-positions" };
    }

    if (hasOpenPosition) {
      return { approved: false, reason: "duplicate-open-position" };
    }

    if (todaysRisk + riskAmount > riskConfig.maxLossPerDay) {
      return { approved: false, reason: "max-loss-per-day" };
    }

    if (allocatedMargin > riskConfig.availableMargin) {
      return { approved: false, reason: "insufficient-margin" };
    }

    if (marketTrend === "down" && signal.side === "LONG") {
      return { approved: false, reason: "market-trend-filter" };
    }

    if (marketTrend === "up" && signal.side === "SHORT") {
      return { approved: false, reason: "market-trend-filter" };
    }

    return {
      approved: true,
      stopLoss,
      quantity,
      riskAmount,
      allocatedMargin
    };
  }
}

export const riskControlEngine = new RiskControlEngine();
export { RiskControlEngine };
