import { SIGNAL_CONFIG } from "../../config/tradingConfig.js";
import { diffMinutes } from "../../utils/time.js";

class SignalEngine {
  constructor() {
    this.signals = [];
  }

  getLastSignal(symbol, side) {
    return this.signals.findLast(
      (item) => item.symbol === symbol && item.side === side
    );
  }

  isDuplicateSignal({ lastSignal, candleStartTime, candidateLevel, comparison }) {
    if (!lastSignal) {
      return false;
    }

    const insideCooldown =
      diffMinutes(lastSignal.timestamp, candleStartTime) < SIGNAL_CONFIG.duplicateSignalCooldownMinutes;

    if (!insideCooldown) {
      return false;
    }

    return comparison(candidateLevel, lastSignal);
  }

  createSignal({ instrument, side, breakoutLevel, supportLevel, candle, averageHistoricalVolPerMin }) {
    const strategy = side === "SHORT"
      ? "Breakdown Detection + Volume Confirmation"
      : "Breakout Detection + Volume Confirmation";

    return {
      symbol: instrument.symbol,
      side,
      strategy,
      breakoutLevel,
      supportLevel,
      close: candle.close,
      candleVolume: candle.volume,
      averageHistoricalVolPerMin,
      timestamp: candle.startTime
    };
  }

  hasMatchingOpenPosition(openPositions = [], symbol, side) {
    return openPositions.some((position) => position.symbol === symbol && position.side === side);
  }

  evaluateBreakout({ candle, previousCandles, instrument, openPositions = [] }) {
    if (!candle || !instrument || previousCandles.length < SIGNAL_CONFIG.breakoutLookback) {
      return null;
    }

    const referenceCandles = previousCandles.slice(-SIGNAL_CONFIG.breakoutLookback);
    const breakoutLevel = Math.max(...referenceCandles.map((item) => item.high));
    const supportLevel = Math.min(...referenceCandles.map((item) => item.low));
    const averageHistoricalVolPerMin = instrument.averageHistoricalVolPerMin ?? 0;
    const volumeConfirmed =
      averageHistoricalVolPerMin > 0 &&
      candle.volume >= averageHistoricalVolPerMin * SIGNAL_CONFIG.volumeConfirmationMultiplier;

    // A signal is only actionable after both price expansion and volume confirmation.
    if (candle.close > breakoutLevel && volumeConfirmed) {
      if (this.hasMatchingOpenPosition(openPositions, instrument.symbol, "LONG")) {
        return null;
      }

      const lastSignal = this.getLastSignal(instrument.symbol, "LONG");

      // Skip repeated breakouts for the same symbol inside the cooldown window.
      if (this.isDuplicateSignal({
        lastSignal,
        candleStartTime: candle.startTime,
        candidateLevel: candle.close,
        comparison: (candidateClose, previousSignal) => candidateClose >= previousSignal.breakoutLevel
      })) {
        return null;
      }

      const signal = this.createSignal({
        instrument,
        side: "LONG",
        breakoutLevel,
        supportLevel,
        candle,
        averageHistoricalVolPerMin
      });

      this.signals.push(signal);
      return signal;
    }

    // Symmetric short setup: downside expansion below recent support with volume confirmation.
    if (candle.close < supportLevel && volumeConfirmed) {
      if (this.hasMatchingOpenPosition(openPositions, instrument.symbol, "SHORT")) {
        return null;
      }

      const lastSignal = this.getLastSignal(instrument.symbol, "SHORT");

      if (this.isDuplicateSignal({
        lastSignal,
        candleStartTime: candle.startTime,
        candidateLevel: candle.close,
        comparison: (candidateClose, previousSignal) => candidateClose <= previousSignal.supportLevel
      })) {
        return null;
      }

      const signal = this.createSignal({
        instrument,
        side: "SHORT",
        breakoutLevel,
        supportLevel,
        candle,
        averageHistoricalVolPerMin
      });

      this.signals.push(signal);
      return signal;
    }

    return null;
  }

  getSignals() {
    return [...this.signals];
  }
}

export const signalEngine = new SignalEngine();
export { SignalEngine };
