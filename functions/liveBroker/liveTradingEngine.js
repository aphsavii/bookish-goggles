import { RISK_CONFIG } from "../../config/tradingConfig.js";
import { RiskControlEngine } from "../engines/riskControlEngine.js";
import { SignalEngine } from "../engines/signalEngine.js";

export class LiveTradingEngine {
  constructor({
    executionEngine,
    signalEngine = new SignalEngine(),
    riskControlEngine = new RiskControlEngine()
  } = {}) {
    if (!executionEngine) {
      throw new Error("LiveTradingEngine requires an executionEngine");
    }

    this.executionEngine = executionEngine;
    this.signalEngine = signalEngine;
    this.riskControlEngine = riskControlEngine;
    this.rejections = [];
  }

  async processClosedCandle({
    candle,
    previousCandles,
    instrument,
    marketTrend = "flat",
    riskConfig = RISK_CONFIG,
    allTrades = []
  }) {
    const openPositions = this.executionEngine.getOpenPositions();
    const signal = this.signalEngine.evaluateBreakout({
      candle,
      previousCandles,
      instrument,
      openPositions,
      marketTrend
    });

    if (!signal) {
      return { signal: null, riskDecision: null, order: null, rejected: false };
    }

    const riskDecision = this.riskControlEngine.validateSignal({
      signal,
      openPositions,
      marketTrend,
      riskConfig,
      allTrades
    });

    if (!riskDecision.approved) {
      const rejection = {
        symbol: signal.symbol,
        timestamp: signal.timestamp,
        reason: riskDecision.reason
      };
      this.rejections.push(rejection);
      return { signal, riskDecision, order: null, rejected: true };
    }

    const order = await this.executionEngine.submitEntry({ signal, riskDecision });
    return { signal, riskDecision, order, rejected: false };
  }

  getSignals() {
    return this.signalEngine.getSignals();
  }

  getRejections() {
    return [...this.rejections];
  }
}
