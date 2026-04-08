import { fetchHistoricalCandles } from "./fetchHistoricalCandles.js";
import { normalizeBacktestCandles } from "../backtest/normalizeBacktestData.js";
import { buildIntradayVolumeProfile } from "./intradayVolumeProfile.js";
import { getIstDateParts, getIstDateTimeString } from "../../utils/time.js";

function buildIstDateTime(daysOffset, timeString) {
  const now = new Date();
  const shifted = new Date(now.getTime() + (daysOffset * 24 * 60 * 60 * 1000));
  const parts = getIstDateParts(shifted);
  return `${parts.year}-${parts.month}-${parts.day} ${timeString}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function preloadIntradayVolumeProfiles(watchlist = [], { lookbackDays = 10 } = {}) {
  const startupDelayMs = Number(process.env.INTRADAY_PROFILE_STARTUP_DELAY_MS ?? 500);
  const betweenRequestsDelayMs = Number(process.env.INTRADAY_PROFILE_BETWEEN_REQUEST_DELAY_MS ?? 750);
  const results = [];

  for (let index = 0; index < watchlist.length; index += 1) {
    const item = watchlist[index];
    const token = item?.exchangeToken ?? item?.symbolToken ?? null;
    if (!token) {
      results.push([item.symbol, {}]);
      continue;
    }

    try {
      if (index === 0 && startupDelayMs > 0) {
        await sleep(startupDelayMs);
      } else if (index > 0 && betweenRequestsDelayMs > 0) {
        await sleep(betweenRequestsDelayMs);
      }

      const fromDate = buildIstDateTime(-lookbackDays, "09:15");
      const toDate = getIstDateTimeString(new Date(), false);
      const rawPayload = await fetchHistoricalCandles(String(token), fromDate, toDate);
      const candles = normalizeBacktestCandles(rawPayload);
      results.push([item.symbol, buildIntradayVolumeProfile(candles)]);
    } catch (error) {
      console.warn(`[Intraday profile] Failed to preload ${item.symbol}: ${error.message}`);
      results.push([item.symbol, {}]);
    }
  }

  return Object.fromEntries(results);
}
