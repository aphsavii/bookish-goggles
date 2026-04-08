import { loadOpenPositions, loadTrades, saveTrade, updateTrade, upsertPosition, deletePosition } from "../../data/tradeStore.js";
import { getIstTimestamp } from "../../utils/time.js";
import { mockBuyOrder, mockSellOrder } from "./mockOrderEngine.js";
import { ORDER_SIMULATION_CONFIG, RISK_CONFIG } from "../../config/tradingConfig.js";

function calculatePnl({ side, entry, exitPrice, quantity }) {
  const direction = side === "LONG" ? 1 : -1;
  return Number((((exitPrice - entry) * direction) * quantity).toFixed(2));
}

function roundPrice(value) {
  return Number(value.toFixed(2));
}

function getActiveTarget(position) {
  const hasScaledOut = Number(position.partialExitCount || 0) > 0;
  return hasScaledOut ? Number(position.secondTarget) : Number(position.target);
}

function getPartialExitQuantity(quantity, fraction = ORDER_SIMULATION_CONFIG.targetPartialExitFraction ?? 0.5) {
  const numericQuantity = Number(quantity);
  if (!Number.isFinite(numericQuantity) || numericQuantity <= 1) {
    return 0;
  }

  const partialQuantity = Math.floor(numericQuantity * fraction);
  return Math.min(Math.max(partialQuantity, 1), numericQuantity - 1);
}

function getInitialRiskPerUnit(position) {
  if (Number.isFinite(position.initialRiskPerUnit) && position.initialRiskPerUnit > 0) {
    return position.initialRiskPerUnit;
  }

  const quantity = Number(position.quantity);
  const riskAmount = Number(position.riskAmount);
  if (Number.isFinite(quantity) && quantity > 0 && Number.isFinite(riskAmount) && riskAmount > 0) {
    return Number((riskAmount / quantity).toFixed(2));
  }

  const target = Number(position.target);
  if (Number.isFinite(target) && Number.isFinite(position.entry)) {
    const rewardToRiskRatio = Number(RISK_CONFIG.rewardToRiskRatio);
    const ratio = Number.isFinite(rewardToRiskRatio) && rewardToRiskRatio > 0
      ? rewardToRiskRatio
      : 2;
    const derivedRisk = Math.abs(target - Number(position.entry)) / ratio;
    if (Number.isFinite(derivedRisk) && derivedRisk > 0) {
      return Number(derivedRisk.toFixed(2));
    }
  }

  const fallbackRisk = Math.abs(Number(position.entry) - Number(position.stopLoss));
  return Number.isFinite(fallbackRisk) && fallbackRisk > 0 ? fallbackRisk : 0;
}

function updateTrailingStop(position, ltp) {
  const initialRiskPerUnit = getInitialRiskPerUnit(position);
  if (!Number.isFinite(initialRiskPerUnit) || initialRiskPerUnit <= 0) {
    return false;
  }

  const isLong = position.side === "LONG";
  position.highestPrice = Math.max(Number(position.highestPrice) || position.entry, ltp);
  position.lowestPrice = Math.min(Number(position.lowestPrice) || position.entry, ltp);

  const favorableMove = isLong
    ? position.highestPrice - position.entry
    : position.entry - position.lowestPrice;
  const achievedR = favorableMove / initialRiskPerUnit;

  let nextStopLoss = position.stopLoss;

  // Protect capital once the trade proves itself by at least 0.5R.
  if (achievedR >= ORDER_SIMULATION_CONFIG.moveStopToBreakevenAtR) {
    nextStopLoss = isLong
      ? Math.max(nextStopLoss, position.entry)
      : Math.min(nextStopLoss, position.entry);
  }

  // After 1R, stop trailing to lock 0.5R of profit behind the best move seen.
  if (achievedR >= ORDER_SIMULATION_CONFIG.trailingStopStepAtR) {
    const lockedProfit = initialRiskPerUnit * ORDER_SIMULATION_CONFIG.trailingStopLockR;
    const trailingCandidate = isLong
      ? position.highestPrice - lockedProfit
      : position.lowestPrice + lockedProfit;

    nextStopLoss = isLong
      ? Math.max(nextStopLoss, trailingCandidate)
      : Math.min(nextStopLoss, trailingCandidate);
  }

  const roundedStopLoss = roundPrice(nextStopLoss);
  if (roundedStopLoss === position.stopLoss) {
    return false;
  }

  position.stopLoss = roundedStopLoss;
  return true;
}

class ExecutionEngine {
  constructor() {
    this.paperTrades = loadTrades();
    this.openPositions = loadOpenPositions();
  }

  execute({ signal, riskDecision }) {
    const trade = mockBuyOrder({ signal, riskDecision });

    if (!trade) {
      return null;
    }

    this.paperTrades.push(trade);
    this.openPositions.push(trade);
    saveTrade(trade);
    return trade;
  }

  updateMarketPrice({ symbol, ltp, timestamp = getIstTimestamp() }) {
    const position = this.openPositions.find((item) => item.symbol === symbol);

    if (!position || !Number.isFinite(ltp)) {
      return { closedTrade: null, positionUpdated: false };
    }

    position.currentPrice = ltp;
    position.unrealizedPnl = calculatePnl({
      side: position.side,
      entry: position.entry,
      exitPrice: ltp,
      quantity: position.quantity
    });

    updateTrailingStop(position, ltp);
    const tradeIndex = this.paperTrades.findIndex((item) => item.tradeId === position.tradeId);
    if (tradeIndex !== -1 && this.paperTrades[tradeIndex].status === "OPEN") {
      this.paperTrades[tradeIndex] = {
        ...this.paperTrades[tradeIndex],
        currentPrice: position.currentPrice,
        unrealizedPnl: position.unrealizedPnl,
        stopLoss: position.stopLoss,
        highestPrice: position.highestPrice,
        lowestPrice: position.lowestPrice
      };
    }

    upsertPosition(position);

    if (position.side === "LONG" && ltp <= position.stopLoss) {
      return {
        closedTrade: this.closePosition({
          symbol,
          exitPrice: ltp,
          exitTimestamp: timestamp,
          closedReason: "stop-loss-hit"
        }),
        positionUpdated: true
      };
    }

    const activeTarget = getActiveTarget(position);

    if (
      position.side === "LONG" &&
      position.targetActive !== false &&
      Number.isFinite(activeTarget) &&
      ltp >= activeTarget
    ) {
      if (Number(position.partialExitCount || 0) === 0) {
        const partialExit = this.takePartialTargetExit({
          symbol,
          exitPrice: ltp,
          exitTimestamp: timestamp
        });
        if (partialExit) {
          return {
            closedTrade: null,
            partialExit,
            positionUpdated: true
          };
        }
      }

      return {
        closedTrade: this.closePosition({
          symbol,
          exitPrice: ltp,
          exitTimestamp: timestamp,
          closedReason: Number(position.partialExitCount || 0) > 0 ? "second-target-hit" : "target-hit"
        }),
        positionUpdated: true
      };
    }

    if (position.side === "SHORT" && ltp >= position.stopLoss) {
      return {
        closedTrade: this.closePosition({
          symbol,
          exitPrice: ltp,
          exitTimestamp: timestamp,
          closedReason: "stop-loss-hit"
        }),
        positionUpdated: true
      };
    }

    if (
      position.side === "SHORT" &&
      position.targetActive !== false &&
      Number.isFinite(activeTarget) &&
      ltp <= activeTarget
    ) {
      if (Number(position.partialExitCount || 0) === 0) {
        const partialExit = this.takePartialTargetExit({
          symbol,
          exitPrice: ltp,
          exitTimestamp: timestamp
        });
        if (partialExit) {
          return {
            closedTrade: null,
            partialExit,
            positionUpdated: true
          };
        }
      }

      return {
        closedTrade: this.closePosition({
          symbol,
          exitPrice: ltp,
          exitTimestamp: timestamp,
          closedReason: Number(position.partialExitCount || 0) > 0 ? "second-target-hit" : "target-hit"
        }),
        positionUpdated: true
      };
    }

    return {
      closedTrade: null,
      positionUpdated: true
    };
  }

  takePartialTargetExit({ symbol, exitPrice, exitTimestamp = getIstTimestamp() }) {
    const position = this.openPositions.find((item) => item.symbol === symbol);
    if (!position || position.targetActive === false) {
      return null;
    }

    const partialQuantity = getPartialExitQuantity(position.quantity);
    if (partialQuantity < 1) {
      return null;
    }

    const closingSide = position.side === "LONG" ? "SHORT" : "LONG";
    const slippageFactor = ORDER_SIMULATION_CONFIG.exitSlippageBps / 10000;
    const direction = closingSide === "LONG" ? 1 : -1;
    const filledExitPrice = Number((Number(exitPrice) * (1 + (direction * slippageFactor))).toFixed(2));
    const realizedPnl = calculatePnl({
      side: position.side,
      entry: position.entry,
      exitPrice: filledExitPrice,
      quantity: partialQuantity
    });

    position.quantity -= partialQuantity;
    position.allocatedMargin = Number((position.entry * position.quantity).toFixed(2));
    position.riskAmount = Number((getInitialRiskPerUnit(position) * position.quantity).toFixed(2));
    position.realizedPnl = Number(((Number(position.realizedPnl) || 0) + realizedPnl).toFixed(2));
    position.partialExitCount = Number(position.partialExitCount || 0) + 1;
    position.partialExitHistory = [
      ...(Array.isArray(position.partialExitHistory) ? position.partialExitHistory : []),
      {
        quantity: partialQuantity,
        exitPrice: filledExitPrice,
        exitTimestamp,
        pnl: realizedPnl,
        reason: "target-partial-exit"
      }
    ];
    position.stopLoss = roundPrice(position.entry);
    position.targetActive = Number.isFinite(Number(position.secondTarget));
    position.currentPrice = filledExitPrice;
    position.unrealizedPnl = calculatePnl({
      side: position.side,
      entry: position.entry,
      exitPrice: filledExitPrice,
      quantity: position.quantity
    });

    const tradeIndex = this.paperTrades.findIndex((item) => item.tradeId === position.tradeId);
    if (tradeIndex !== -1) {
      this.paperTrades[tradeIndex] = {
        ...this.paperTrades[tradeIndex],
        ...position
      };
      updateTrade(this.paperTrades[tradeIndex]);
    }

    upsertPosition(position);

    return {
      symbol: position.symbol,
      side: position.side,
      quantity: partialQuantity,
      remainingQuantity: position.quantity,
      exitPrice: filledExitPrice,
      exitTimestamp,
      pnl: realizedPnl,
      reason: "target-partial-exit"
    };
  }

  closePosition({ symbol, exitPrice, exitTimestamp = getIstTimestamp(), closedReason = "manual-close" }) {
    const index = this.openPositions.findIndex((item) => item.symbol === symbol);
    if (index === -1) {
      return null;
    }

    const position = this.openPositions[index];
    const closedTrade = mockSellOrder({
      position,
      exitPrice,
      exitTimestamp,
      closedReason
    });

    if (!closedTrade) {
      return null;
    }

    this.openPositions.splice(index, 1);

    const tradeIndex = this.paperTrades.findIndex((item) => item.tradeId === closedTrade.tradeId);
    if (tradeIndex !== -1) {
      this.paperTrades[tradeIndex] = closedTrade;
      updateTrade(closedTrade);
    }

    deletePosition(symbol);
    return closedTrade;
  }

  squareOffOpenPositions({ exitTimestamp = getIstTimestamp(), getExitPrice, closedReason = "auto-square-off" }) {
    const openSymbols = this.openPositions.map((position) => position.symbol);
    const closedTrades = [];

    for (const symbol of openSymbols) {
      const exitPrice = Number(getExitPrice?.(symbol));
      if (!Number.isFinite(exitPrice)) {
        continue;
      }

      const closedTrade = this.closePosition({
        symbol,
        exitPrice,
        exitTimestamp,
        closedReason
      });

      if (closedTrade) {
        closedTrades.push(closedTrade);
      }
    }

    return closedTrades;
  }

  hasOpenPosition(symbol) {
    return this.openPositions.some((position) => position.symbol === symbol);
  }

  getOpenPositions() {
    return [...this.openPositions];
  }

  getPaperTrades() {
    return [...this.paperTrades];
  }
}

export const executionEngine = new ExecutionEngine();
export { ExecutionEngine, calculatePnl, updateTrailingStop };
