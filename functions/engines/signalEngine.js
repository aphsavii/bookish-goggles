import { SIGNAL_CONFIG } from "../../config/tradingConfig.js";
import { diffMinutes, getIstDateParts } from "../../utils/time.js";

function getSessionDateKey(value) {
  if (!value) {
    return null;
  }

  const directMatch = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  if (directMatch) {
    return directMatch[1];
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  return parsed.toISOString().slice(0, 10);
}

function getMinuteOfSessionKey(value) {
  if (!value) {
    return null;
  }

  const parsed = new Date(String(value).replace(" ", "T"));
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }

  const parts = getIstDateParts(parsed);
  return `${parts.hour}:${parts.minute}`;
}

function calculateIntradayVolumeContext(previousCandles = [], candleStartTime, intradayVolumeProfile = {}) {
  const sessionDateKey = getSessionDateKey(candleStartTime);
  const minuteKey = getMinuteOfSessionKey(candleStartTime);
  if (!sessionDateKey) {
    return {
      sessionSampleCount: 0,
      sessionAverageVolumePerMin: 0,
      timeOfDaySampleCount: 0,
      timeOfDayAverageVolumePerMin: 0
    };
  }

  const sameSessionCandles = previousCandles.filter((item) =>
    getSessionDateKey(item.startTime ?? item.timestamp ?? item.bucket) === sessionDateKey &&
    Number.isFinite(Number(item.volume))
  );

  const sameMinuteCandles = minuteKey
    ? previousCandles.filter((item) =>
        getMinuteOfSessionKey(item.startTime ?? item.timestamp ?? item.bucket) === minuteKey &&
        Number.isFinite(Number(item.volume))
      )
    : [];

  const sessionTotalVolume = sameSessionCandles.reduce((sum, item) => sum + Number(item.volume), 0);
  const timeOfDayTotalVolume = sameMinuteCandles.reduce((sum, item) => sum + Number(item.volume), 0);
  const profileEntry = minuteKey ? intradayVolumeProfile[minuteKey] ?? null : null;

  return {
    sessionSampleCount: sameSessionCandles.length,
    sessionAverageVolumePerMin: sameSessionCandles.length > 0
      ? Number((sessionTotalVolume / sameSessionCandles.length).toFixed(2))
      : 0,
    timeOfDaySampleCount: sameMinuteCandles.length,
    timeOfDayAverageVolumePerMin: sameMinuteCandles.length > 0
      ? Number((timeOfDayTotalVolume / sameMinuteCandles.length).toFixed(2))
      : 0,
    profileSampleCount: profileEntry?.sampleCount ?? 0,
    profileAverageVolumePerMin: profileEntry?.averageVolumePerMin ?? 0
  };
}

function calculateTrueRange(candle, previousClose) {
  const high = Number(candle?.high);
  const low = Number(candle?.low);

  if (!Number.isFinite(high) || !Number.isFinite(low)) {
    return 0;
  }

  const highLow = high - low;
  const highPrevClose = Number.isFinite(previousClose) ? Math.abs(high - previousClose) : highLow;
  const lowPrevClose = Number.isFinite(previousClose) ? Math.abs(low - previousClose) : highLow;

  return Math.max(highLow, highPrevClose, lowPrevClose);
}

function calculateAverageTrueRange(candles = [], period = SIGNAL_CONFIG.atrLookback) {
  if (!Number.isFinite(period) || period <= 0 || candles.length < period) {
    return 0;
  }

  const startIndex = candles.length - period;
  const window = candles.slice(-period);
  const priorClose = Number(candles[startIndex - 1]?.close);
  const previousClose = Number.isFinite(priorClose) ? priorClose : Number(window[0]?.close);
  if (!Number.isFinite(previousClose)) {
    return 0;
  }

  const trueRanges = window.map((candle, index) => {
    const tr = calculateTrueRange(candle, index === 0 ? previousClose : Number(window[index - 1]?.close));
    return Number.isFinite(tr) ? tr : 0;
  });

  const total = trueRanges.reduce((sum, value) => sum + value, 0);
  return Number((total / trueRanges.length).toFixed(2));
}

function getCandleStructure(candle) {
  const open = Number(candle?.open);
  const high = Number(candle?.high);
  const low = Number(candle?.low);
  const close = Number(candle?.close);
  const range = high - low;
  const body = Math.abs(close - open);
  const bullish = close >= open;
  const closeToHigh = range > 0 ? (high - close) / range : 1;
  const closeToLow = range > 0 ? (close - low) / range : 1;

  return {
    open,
    high,
    low,
    close,
    range,
    body,
    bodyRatio: range > 0 ? body / range : 0,
    bullish,
    closeToHigh,
    closeToLow
  };
}

function getAdaptiveLookback({ atr, breakoutLevel, marketTrend }) {
  const baseLookback = SIGNAL_CONFIG.breakoutLookback ?? 4;
  const atrPct = breakoutLevel > 0 ? atr / breakoutLevel : 0;
  let lookback = baseLookback;

  if (marketTrend === "flat") {
    lookback += SIGNAL_CONFIG.flatMarketLookbackBoost ?? 1;
  }

  if (atrPct >= (SIGNAL_CONFIG.highVolatilityAtrPctThreshold ?? 0.03)) {
    lookback += SIGNAL_CONFIG.highVolatilityLookbackBoost ?? 1;
  }

  return Math.max(3, lookback);
}

function isStrongBreakoutCandle(candle, side) {
  const structure = getCandleStructure(candle);
  const minBodyToRangeRatio = SIGNAL_CONFIG.minBodyToRangeRatio ?? 0.55;
  const maxCloseToExtremeRatio = SIGNAL_CONFIG.maxCloseToExtremeRatio ?? 0.35;

  if (structure.range <= 0) {
    return false;
  }

  if (side === "LONG") {
    return (
      structure.bullish &&
      structure.bodyRatio >= minBodyToRangeRatio &&
      structure.closeToHigh <= maxCloseToExtremeRatio
    );
  }

  return (
    !structure.bullish &&
    structure.bodyRatio >= minBodyToRangeRatio &&
    structure.closeToLow <= maxCloseToExtremeRatio
  );
}

function isRetestHoldCandle(candle, side, triggerLevel) {
  const structure = getCandleStructure(candle);

  if (structure.range <= 0) {
    return false;
  }

  if (side === "LONG") {
    return (
      Number.isFinite(triggerLevel) &&
      structure.low <= triggerLevel &&
      structure.close > triggerLevel &&
      structure.close >= structure.open
    );
  }

  return (
    Number.isFinite(triggerLevel) &&
    structure.high >= triggerLevel &&
    structure.close < triggerLevel &&
    structure.close <= structure.open
  );
}

function resolveVolumeConfirmation({
  candle,
  averageHistoricalVolPerMin,
  todayVolumeSampleCount,
  todayAverageVolumePerMin,
  sameMinuteAverageVolumePerMin,
  sameMinuteSampleCount,
  profileSampleCount,
  profileAverageVolumePerMin
}) {
  const historicalVolumeRatio = averageHistoricalVolPerMin > 0
    ? Number((candle.volume / averageHistoricalVolPerMin).toFixed(2))
    : null;
  const todayVolumeAccelerationRatio = todayAverageVolumePerMin > 0
    ? Number((candle.volume / todayAverageVolumePerMin).toFixed(2))
    : null;
  const timeOfDayAverageResolved = profileSampleCount > 0
    ? profileAverageVolumePerMin
    : sameMinuteAverageVolumePerMin;
  const timeOfDaySampleCountResolved = profileSampleCount > 0
    ? profileSampleCount
    : sameMinuteSampleCount;
  const timeOfDayVolumeRatio = timeOfDayAverageResolved > 0
    ? Number((candle.volume / timeOfDayAverageResolved).toFixed(2))
    : null;
  const historicalVolumeConfirmed =
    averageHistoricalVolPerMin > 0 &&
    candle.volume >= averageHistoricalVolPerMin * SIGNAL_CONFIG.historicalVolumeConfirmationMultiplier;
  const sessionVolumeConfirmed =
    todayVolumeSampleCount >= SIGNAL_CONFIG.minTodayVolumeSamples &&
    todayAverageVolumePerMin > 0 &&
    candle.volume >= todayAverageVolumePerMin * SIGNAL_CONFIG.todayVolumeAccelerationMultiplier;
  const timeOfDayVolumeConfirmed =
    timeOfDaySampleCountResolved >= SIGNAL_CONFIG.minTimeOfDayVolumeSamples &&
    timeOfDayAverageResolved > 0 &&
    candle.volume >= timeOfDayAverageResolved * SIGNAL_CONFIG.timeOfDayVolumeAccelerationMultiplier;

  let volumeConfirmed = historicalVolumeConfirmed;
  let volumeConfirmationBasis = "historical";

  if (SIGNAL_CONFIG.volumeConfirmationMode === "today") {
    volumeConfirmed = sessionVolumeConfirmed;
    volumeConfirmationBasis = "session";
  } else if (SIGNAL_CONFIG.volumeConfirmationMode === "both") {
    volumeConfirmed = historicalVolumeConfirmed && (timeOfDayVolumeConfirmed || sessionVolumeConfirmed);
    if (timeOfDayVolumeConfirmed) {
      volumeConfirmationBasis = profileSampleCount > 0 ? "historical-profile" : "same-minute-session";
    } else if (sessionVolumeConfirmed) {
      volumeConfirmationBasis = "session";
    } else {
      volumeConfirmationBasis = "historical";
    }
  } else if (SIGNAL_CONFIG.volumeConfirmationMode === "either") {
    if (timeOfDayVolumeConfirmed) {
      volumeConfirmed = true;
      volumeConfirmationBasis = profileSampleCount > 0 ? "historical-profile" : "same-minute-session";
    } else if (sessionVolumeConfirmed) {
      volumeConfirmed = true;
      volumeConfirmationBasis = "session";
    } else {
      volumeConfirmed = historicalVolumeConfirmed;
      volumeConfirmationBasis = "historical";
    }
  }

  return {
    volumeConfirmed,
    volumeConfirmationBasis,
    historicalVolumeRatio,
    todayVolumeAccelerationRatio,
    timeOfDayAverageResolved,
    timeOfDayVolumeRatio
  };
}

function buildSignal({
  instrument,
  side,
  breakoutLevel,
  supportLevel,
  candle,
  averageHistoricalVolPerMin,
  atr,
  breakoutBuffer,
  effectiveLookback,
  triggerLevel,
  setupType,
  volumeConfirmationBasis,
  signalModel
}) {
  const strategy = side === "SHORT"
    ? "Breakdown Detection + Volume Confirmation"
    : "Breakout Detection + Volume Confirmation";
  const {
    todayAverageVolumePerMin = 0,
    timeOfDayAverageVolumePerMin = 0,
    timeOfDayVolumeRatio = null,
    todayVolumeAccelerationRatio = null,
    historicalVolumeRatio = null
  } = instrument;

  return {
    symbol: instrument.symbol,
    side,
    strategy,
    setupType,
    signalModel,
    breakoutLevel,
    supportLevel,
    breakoutBuffer,
    effectiveLookback,
    triggerLevel,
    volumeConfirmationBasis,
    atr,
    close: candle.close,
    candleVolume: candle.volume,
    averageHistoricalVolPerMin,
    todayAverageVolumePerMin,
    timeOfDayAverageVolumePerMin,
    timeOfDayVolumeRatio,
    todayVolumeAccelerationRatio,
    historicalVolumeRatio,
    volumeConfirmationMode: volumeConfirmationBasis,
    timestamp: candle.startTime
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

  hasMatchingOpenPosition(openPositions = [], symbol, side) {
    return openPositions.some((position) => position.symbol === symbol && position.side === side);
  }

  evaluateCoreBreakout({ candle, previousCandles, instrument, openPositions = [], marketTrend = "flat" }) {
    return this.evaluateBreakoutInternal({
      candle,
      previousCandles,
      instrument,
      openPositions,
      marketTrend,
      signalModel: "core",
      requireCandleQuality: false
    });
  }

  evaluateConfirmedBreakout({ candle, previousCandles, instrument, openPositions = [], marketTrend = "flat" }) {
    return this.evaluateBreakoutInternal({
      candle,
      previousCandles,
      instrument,
      openPositions,
      marketTrend,
      signalModel: "confirmation",
      requireCandleQuality: true
    });
  }

  evaluateBreakout(args) {
    const signalModel = SIGNAL_CONFIG.signalModel === "confirmation" ? "confirmation" : "core";
    return signalModel === "confirmation"
      ? this.evaluateConfirmedBreakout(args)
      : this.evaluateCoreBreakout(args);
  }

  evaluateBreakoutInternal({
    candle,
    previousCandles,
    instrument,
    openPositions = [],
    marketTrend = "flat",
    signalModel,
    requireCandleQuality
  }) {
    if (!candle || !instrument) {
      return null;
    }

    const atrLookback = SIGNAL_CONFIG.atrLookback ?? 5;
    if (previousCandles.length < atrLookback) {
      return null;
    }

    const atr = calculateAverageTrueRange(previousCandles, atrLookback);
    if (!Number.isFinite(atr) || atr <= 0) {
      return null;
    }

    const averageHistoricalVolPerMin = instrument.averageHistoricalVolPerMin ?? 0;
    const {
      sessionSampleCount: todayVolumeSampleCount,
      sessionAverageVolumePerMin: todayAverageVolumePerMin,
      timeOfDaySampleCount,
      timeOfDayAverageVolumePerMin: sameMinuteAverageVolumePerMin,
      profileSampleCount,
      profileAverageVolumePerMin
    } = calculateIntradayVolumeContext(previousCandles, candle.startTime, instrument.intradayVolumeProfile ?? {});

    const volumeContext = resolveVolumeConfirmation({
      candle,
      averageHistoricalVolPerMin,
      todayVolumeSampleCount,
      todayAverageVolumePerMin,
      sameMinuteAverageVolumePerMin,
      sameMinuteSampleCount: timeOfDaySampleCount,
      profileSampleCount,
      profileAverageVolumePerMin
    });

    const breakoutBuffer = Number((atr * (SIGNAL_CONFIG.breakoutBufferAtrMultiplier ?? 0.1)).toFixed(2));
    const effectiveLookback = getAdaptiveLookback({
      atr,
      breakoutLevel: candle.close,
      marketTrend
    });
    if (previousCandles.length < Math.max(effectiveLookback, atrLookback)) {
      return null;
    }

    const referenceCandles = previousCandles.slice(-effectiveLookback);
    const breakoutLevel = Math.max(...referenceCandles.map((item) => Number(item.high)));
    const supportLevel = Math.min(...referenceCandles.map((item) => Number(item.low)));
    const longTriggerLevel = Number((breakoutLevel + breakoutBuffer).toFixed(2));
    const shortTriggerLevel = Number((supportLevel - breakoutBuffer).toFixed(2));

    const enrichedInstrument = {
      ...instrument,
      todayAverageVolumePerMin,
      timeOfDayAverageVolumePerMin: volumeContext.timeOfDayAverageResolved,
      timeOfDayVolumeRatio: volumeContext.timeOfDayVolumeRatio,
      todayVolumeAccelerationRatio: volumeContext.todayVolumeAccelerationRatio,
      historicalVolumeRatio: volumeContext.historicalVolumeRatio,
      volumeConfirmationBasis: volumeContext.volumeConfirmationBasis
    };

    const passesQuality = (side, triggerLevel) => {
      if (!requireCandleQuality) {
        return true;
      }

      return isStrongBreakoutCandle(candle, side) || isRetestHoldCandle(candle, side, triggerLevel);
    };

    if (
      candle.close > longTriggerLevel &&
      volumeContext.volumeConfirmed &&
      passesQuality("LONG", longTriggerLevel)
    ) {
      if (this.hasMatchingOpenPosition(openPositions, instrument.symbol, "LONG")) {
        return null;
      }

      const lastSignal = this.getLastSignal(instrument.symbol, "LONG");
      if (this.isDuplicateSignal({
        lastSignal,
        candleStartTime: candle.startTime,
        candidateLevel: candle.close,
        comparison: (candidateClose, previousSignal) => candidateClose >= previousSignal.breakoutLevel
      })) {
        return null;
      }

      const signal = buildSignal({
        instrument: enrichedInstrument,
        side: "LONG",
        breakoutLevel,
        supportLevel,
        candle,
        averageHistoricalVolPerMin,
        atr,
        breakoutBuffer,
        effectiveLookback,
        triggerLevel: longTriggerLevel,
        setupType: isRetestHoldCandle(candle, "LONG", longTriggerLevel) ? "retest-hold" : "strong-breakout",
        volumeConfirmationBasis: volumeContext.volumeConfirmationBasis,
        signalModel
      });

      this.signals.push(signal);
      return signal;
    }

    if (
      candle.close < shortTriggerLevel &&
      volumeContext.volumeConfirmed &&
      passesQuality("SHORT", shortTriggerLevel)
    ) {
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

      const signal = buildSignal({
        instrument: enrichedInstrument,
        side: "SHORT",
        breakoutLevel,
        supportLevel,
        candle,
        averageHistoricalVolPerMin,
        atr,
        breakoutBuffer,
        effectiveLookback,
        triggerLevel: shortTriggerLevel,
        setupType: isRetestHoldCandle(candle, "SHORT", shortTriggerLevel) ? "retest-hold" : "strong-breakdown",
        volumeConfirmationBasis: volumeContext.volumeConfirmationBasis,
        signalModel
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
export { SignalEngine, calculateAverageTrueRange, calculateIntradayVolumeContext };
