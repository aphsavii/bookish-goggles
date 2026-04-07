import { SIGNAL_CONFIG } from "../../config/tradingConfig.js";
import { diffMinutes } from "../../utils/time.js";

function getSessionDateKey(value) {
  if (!value) {
    return null;
  }

  const directMatch = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function calculateTodayAverageVolume(previousCandles = [], candleStartTime) {
  const sessionDateKey = getSessionDateKey(candleStartTime);
  if (!sessionDateKey) {
    return {
      sampleCount: 0,
      averageVolume: 0
    };
  }

  const sameSessionCandles = previousCandles.filter((item) =>
    getSessionDateKey(item.startTime ?? item.timestamp ?? item.bucket) === sessionDateKey &&
    Number.isFinite(Number(item.volume))
  );

  if (sameSessionCandles.length === 0) {
    return {
      sampleCount: 0,
      averageVolume: 0
    };
  }

  const totalVolume = sameSessionCandles.reduce(
    (sum, item) => sum + Number(item.volume),
    0
  );

  return {
    sampleCount: sameSessionCandles.length,
    averageVolume: Number((totalVolume / sameSessionCandles.length).toFixed(2))
  };
}

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
    const {
      todayAverageVolumePerMin = 0,
      todayVolumeAccelerationRatio = null,
      historicalVolumeRatio = null
    } = instrument;

    return {
      symbol: instrument.symbol,
      side,
      strategy,
      breakoutLevel,
      supportLevel,
      close: candle.close,
      candleVolume: candle.volume,
      averageHistoricalVolPerMin,
      todayAverageVolumePerMin,
      todayVolumeAccelerationRatio,
      historicalVolumeRatio,
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
    const {
      averageVolume: todayAverageVolumePerMin,
      sampleCount: todayVolumeSampleCount
    } = calculateTodayAverageVolume(previousCandles, candle.startTime);
    const historicalVolumeRatio = averageHistoricalVolPerMin > 0
      ? Number((candle.volume / averageHistoricalVolPerMin).toFixed(2))
      : null;
    const todayVolumeAccelerationRatio = todayAverageVolumePerMin > 0
      ? Number((candle.volume / todayAverageVolumePerMin).toFixed(2))
      : null;
    const historicalVolumeConfirmed =
      averageHistoricalVolPerMin > 0 &&
      candle.volume >= averageHistoricalVolPerMin * SIGNAL_CONFIG.historicalVolumeConfirmationMultiplier;
    const todayVolumeConfirmed =
      todayVolumeSampleCount >= SIGNAL_CONFIG.minTodayVolumeSamples &&
      todayAverageVolumePerMin > 0 &&
      candle.volume >= todayAverageVolumePerMin * SIGNAL_CONFIG.todayVolumeAccelerationMultiplier;

    let volumeConfirmed = historicalVolumeConfirmed;
    if (SIGNAL_CONFIG.volumeConfirmationMode === "today") {
      volumeConfirmed = todayVolumeConfirmed;
    } else if (SIGNAL_CONFIG.volumeConfirmationMode === "both") {
      volumeConfirmed = historicalVolumeConfirmed && todayVolumeConfirmed;
    } else if (SIGNAL_CONFIG.volumeConfirmationMode === "either") {
      volumeConfirmed = historicalVolumeConfirmed || todayVolumeConfirmed;
    }

    const enrichedInstrument = {
      ...instrument,
      todayAverageVolumePerMin,
      todayVolumeAccelerationRatio,
      historicalVolumeRatio
    };

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
        instrument: enrichedInstrument,
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
        instrument: enrichedInstrument,
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
