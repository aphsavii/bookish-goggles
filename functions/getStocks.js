import axios from "axios";

export async function fetchAndProcessStocks(filters = {}) {
  try {
    const {
      minPrice = null,
      maxPrice = null,
      minVolume = null,
      minTValue = null
    } = filters;

    const apiUrl =
      "https://www.nseindia.com/api/equity-stockIndices?index=SECURITIES%20IN%20F%26O";

    const response = await axios.get(apiUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
        "Referer": "https://www.nseindia.com/",
        "Connection": "keep-alive"
      }
    });

    const stocks = response.data?.data || [];

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
        close: ltp,

        ltp: ltp,
        pChange: Number(data.pChange),

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