import { fetchAndProcessStocks } from "./Step1GetStocks.js"
import filterOnGapPct from "./Step2FilterOnGapPct.js";
import { addAverageHistoricalVolPerMin } from "../helpers/getMarketData.js";
import filterByValue from "./step3FilterByValue.js";
import { WATCHLIST_CONFIG } from "../../config/tradingConfig.js";

const getWatchList = async () => {
  const step1 = await fetchAndProcessStocks({
    minPrice: WATCHLIST_CONFIG.minPrice,
    maxPrice: WATCHLIST_CONFIG.maxPrice
  });

  if (!step1 || step1.error) {
    throw new Error(
      `Watchlist fetch failed${step1?.message ? `: ${step1.message}` : ""}`
    );
  }

  const step2 = filterOnGapPct(step1);
  const step3 = filterByValue(step2);
  const topWatchlist = step3.slice(0, WATCHLIST_CONFIG.maxInstruments);
  const enrichedWatchlist = await addAverageHistoricalVolPerMin(topWatchlist);

  return enrichedWatchlist;
};

export default getWatchList;
