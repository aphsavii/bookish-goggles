import { getIstDateParts } from "../../utils/time.js";

function getMinuteBucket(timestamp = new Date()) {
  const parts = getIstDateParts(timestamp);
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`;
}

class CandleEngine {
  constructor() {
    this.activeCandles = new Map();
    this.closedCandles = new Map();
    this.lastCumulativeVolume = new Map();
  }

  getCandles(symbol) {
    return this.closedCandles.get(symbol) ?? [];
  }

  getActiveCandle(symbol) {
    return this.activeCandles.get(symbol) ?? null;
  }

  processTick({ symbol, ltp, cumulativeVolume, timestamp = new Date() }) {
    if (!symbol || !Number.isFinite(ltp)) {
      return { closedCandle: null, activeCandle: null };
    }

    const bucket = getMinuteBucket(timestamp);
    const active = this.activeCandles.get(symbol);
    let closedCandle = null;

    if (!active || active.bucket !== bucket) {
      if (active) {
        closedCandle = { ...active };
        const history = this.closedCandles.get(symbol) ?? [];
        history.push(closedCandle);

        // Keep recent candles only; the engines only need a small rolling window.
        this.closedCandles.set(symbol, history.slice(-120));
      }

      this.activeCandles.set(symbol, {
        symbol,
        bucket,
        open: ltp,
        high: ltp,
        low: ltp,
        close: ltp,
        volume: 0,
        startTime: bucket
      });
    } else {
      active.high = Math.max(active.high, ltp);
      active.low = Math.min(active.low, ltp);
      active.close = ltp;
    }

    const current = this.activeCandles.get(symbol);

    // Neo feed volume is cumulative for the session, so candle volume is delta volume.
    if (Number.isFinite(cumulativeVolume)) {
      const lastVolume = this.lastCumulativeVolume.get(symbol);
      if (Number.isFinite(lastVolume) && cumulativeVolume >= lastVolume) {
        current.volume += cumulativeVolume - lastVolume;
      }
      this.lastCumulativeVolume.set(symbol, cumulativeVolume);
    }

    return {
      closedCandle,
      activeCandle: { ...current }
    };
  }
}

export const candleEngine = new CandleEngine();
export { CandleEngine };
