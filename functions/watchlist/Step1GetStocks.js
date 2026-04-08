import axios from "axios";

async function fetchStocksFromUrl(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Accept-Language": "en-US,en;q=0.9",
      "Referer": "https://www.nseindia.com/",
      "Connection": "keep-alive",
      "Cache-Control": "no-cache"
    },
    proxy: false,
    timeout: 10000
  });

  return response.data?.data || [];
}

export async function fetchAndProcessStocks(filters = {}) {
  try {
    const {
      minPrice = null,
      maxPrice = null,
      minVolume = null,
      minTValue = null
    } = filters;
    const ENVIRONMENT = process.env.ENVIRONMENT;
    const primaryApiUrl = ENVIRONMENT == "DEV"
      ? "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O"
      : "https://trade.aphsavii.workers.dev/";

    let stocks = [];

    try {
      stocks = await fetchStocksFromUrl(primaryApiUrl);
    } catch (primaryError) {
      if (ENVIRONMENT !== "DEV") {
        throw primaryError;
      }

      console.warn(`[Watchlist] Primary NSE fetch failed, falling back to worker: ${primaryError.message}`);
      stocks = await fetchStocksFromUrl("https://trade.aphsavii.workers.dev/");
    }

    // ---- STEP 1: Transform ----
    const transformed = stocks.map((data) => {
      const ltp = parseFloat(data.lastPrice);

      return {
        symbol: data.symbol,
        companyName: data.meta?.companyName,
        industry: data.meta?.industry,
        date: new Date().toISOString().slice(0, 10),

        open: parseFloat(data.open),
        high: parseFloat(data.dayHigh),
        low: parseFloat(data.dayLow),
        prevClose: parseFloat(data.previousClose),
        ltp: ltp,
        pChange: Number(data.pChange),
        gapPct : parseFloat(((data.open-data.previousClose)/data.previousClose)*100),

        volume: Number(data.totalTradedVolume),
        tradedValue: Number(data.totalTradedValue)
      };
    });

    // ---- STEP 2: Filter ----
    const result = transformed.filter((stock) => {
      if (minPrice !== null && stock.ltp < minPrice) return false;
      if (maxPrice !== null && stock.ltp > maxPrice) return false;

      if (minVolume !== null && stock.volume < minVolume) return false;
      if (minTValue !== null && stock.tradedValue < minTValue) return false;

      return true;
    });

    // ---- STEP 3: Aggregate ----
    let advance = 0;
    let decline = 0;
    let unchanged = 0;

    let totalVolume = 0;
    let totalTradedValue = 0;
    let totalPChange = 0;

    result.forEach((stock) => {
      if (stock.pChange > 0) advance++;
      else if (stock.pChange < 0) decline++;
      else unchanged++;

      totalVolume += stock.volume;
      totalTradedValue += stock.tradedValue;
      totalPChange += stock.pChange;
    });

    const count = result.length;

    const overall = {
      count,

      breadth: {
        advance,
        decline,
        unchanged,
        advanceDeclineRatio:
          decline === 0 ? advance : Number((advance / decline).toFixed(2))
      },

      totals: {
        volume: totalVolume,
        tradedValue: totalTradedValue
      },

      averages: {
        pChange: count === 0 ? 0 : Number((totalPChange / count).toFixed(2))
      }
    };

    return {
      overall,
      instruments: result
    };

  } catch (err) {
    return {
      error: true,
      message: err.message
    };
  }
}
