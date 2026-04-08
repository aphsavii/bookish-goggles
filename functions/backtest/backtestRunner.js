import { RISK_CONFIG } from "../../config/tradingConfig.js";
import { SignalEngine } from "../engines/signalEngine.js";
import { RiskControlEngine } from "../engines/riskControlEngine.js";
import { BacktestExecutionEngine } from "./backtestExecutionEngine.js";
import { calculateBacktestMetrics } from "./backtestMetrics.js";
import { normalizeBacktestCandles } from "./normalizeBacktestData.js";
import { fetchHistoricalCandles } from "../helpers/fetchHistoricalCandles.js";

function buildInstrument({ symbol, averageHistoricalVolPerMin = 0 }) {
  return {
    symbol,
    averageHistoricalVolPerMin
  };
}

export async function runBacktest({
  symbol,
  symbolToken,
  fromDate,
  toDate,
  averageHistoricalVolPerMin = 0,
  marketTrend = "up",
  candles
}) {
  const signalEngine = new SignalEngine();
  const riskControlEngine = new RiskControlEngine();
  const executionEngine = new BacktestExecutionEngine();
  const instrument = buildInstrument({ symbol, averageHistoricalVolPerMin });
  const rawPayload = candles ?? await fetchHistoricalCandles(symbolToken, fromDate, toDate);
  const normalizedCandles = normalizeBacktestCandles(rawPayload);
  const closedCandles = [];
  const rejections = [];

  for (const candle of normalizedCandles) {
    executionEngine.fillPendingEntry(candle);
    executionEngine.updateOpenPositions(candle);

    const closedCandle = {
      symbol,
      bucket: candle.timestamp.slice(0, 16),
      open: candle.open,
      high: candle.high,
      low: candle.low,
      close: candle.close,
      volume: candle.volume,
      startTime: candle.timestamp
    };

    const signal = signalEngine.evaluateBreakout({
      candle: closedCandle,
      previousCandles: closedCandles,
      instrument,
      openPositions: executionEngine.getOpenPositions(),
      marketTrend
    });

    closedCandles.push(closedCandle);

    if (!signal) {
      continue;
    }

    const allocatedMargin = executionEngine.getOpenPositions().reduce(
      (sum, position) => sum + (Number(position.allocatedMargin) || 0),
      0
    );
    const availableMargin = Math.max(RISK_CONFIG.totalMarginAvailable - allocatedMargin, 0);

    const riskDecision = riskControlEngine.validateSignal({
      signal,
      openPositions: executionEngine.getOpenPositions(),
      marketTrend,
      riskConfig: {
        ...RISK_CONFIG,
        availableMargin
      },
      allTrades: executionEngine.trades
    });

    if (!riskDecision.approved) {
      rejections.push({
        symbol,
        timestamp: candle.timestamp,
        reason: riskDecision.reason
      });
      continue;
    }

    executionEngine.queueEntry({ signal, riskDecision });
  }

  if (normalizedCandles.length > 0 && executionEngine.getOpenPositions().length > 0) {
    executionEngine.forceCloseAll(normalizedCandles[normalizedCandles.length - 1]);
    executionEngine.clearOpenPositions();
  }

  return {
    symbol,
    fromDate,
    toDate,
    candles: normalizedCandles,
    trades: executionEngine.trades,
    signals: signalEngine.getSignals(),
    rejections,
    metrics: calculateBacktestMetrics(executionEngine.trades)
  };
}
