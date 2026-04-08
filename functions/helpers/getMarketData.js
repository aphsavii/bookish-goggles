import axios from "axios";

function formatDate(date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata"
  }).format(date).replace(/\//g, "-");
}

function parseTradingDate(value) {
  if (!value) {
    return null;
  }

  const match = String(value).match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/);
  if (match) {
    const [, day, monthLabel, year] = match;
    const monthMap = {
      Jan: "01",
      Feb: "02",
      Mar: "03",
      Apr: "04",
      May: "05",
      Jun: "06",
      Jul: "07",
      Aug: "08",
      Sep: "09",
      Oct: "10",
      Nov: "11",
      Dec: "12"
    };

    const month = monthMap[monthLabel];
    if (month) {
      return `${year}-${month}-${day}`;
    }
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString().slice(0, 10);
}

function normalizeHistoricalRow(row = {}) {
  const open = Number(row.chOpeningPrice ?? 0);
  const prevClose = Number(row.chPreviousClsPrice ?? 0);

  return {
    symbol: row.chSymbol ?? null,
    series: row.chSeries ?? null,
    previousClose: Number(row.chPreviousClsPrice ?? 0),
    open,
    high: Number(row.chTradeHighPrice ?? 0),
    low: Number(row.chTradeLowPrice ?? 0),
    ltp: Number(row.chLastTradedPrice ?? 0),
    close: Number(row.chClosingPrice ?? row.chLastTradedPrice ?? 0),
    vwap: Number(row.vwap ?? 0),
    volume: Number(row.chTotTradedQty ?? 0),
    tradedValue: Number(row.chTotTradedVal ?? 0),
    totalTrades: Number(row.chTotalTrades ?? 0),
    week52High: Number(row.ch52WeekHighPrice ?? 0),
    week52Low: Number(row.ch52WeekLowPrice ?? 0),
    marketDate: parseTradingDate(row.mtimestamp),
    gapPct: prevClose === 0 ? 0 : Number((((open - prevClose) / prevClose) * 100).toFixed(2)),
    pChange: prevClose === 0
      ? 0
      : Number((((Number(row.chLastTradedPrice ?? 0) - prevClose) / prevClose) * 100).toFixed(2))
  };
}

function getAverageVolumePerMinute(row) {
  const tradingMinutes = 375;
  return Number((row.volume / tradingMinutes).toFixed(2));
}

async function fetchHistoricalTradeData(symbol, {
  series = "EQ",
  fromDate,
  toDate
} = {}) {
  const resolvedToDate = toDate || formatDate(new Date());
  const resolvedFromDate = fromDate || formatDate(
    new Date(new Date().setDate(new Date().getDate() - 10))
  );

  const uri = `https://nameless-hat-8a61.aphsavii.workers.dev/api/historical-data?symbol=${symbol}&series=${series}&fromDate=${resolvedFromDate}&toDate=${resolvedToDate}`;

  const maxRetries = 3;
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await axios.get(uri, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
          "Accept": "application/json",
          "Connection": "keep-alive",
          "Accept-Language": "en-US,en;q=0.9",
          "Cache-Control": "no-cache"
        },
        timeout: 10000
      });

      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      lastError = error;
      console.warn(`[Market Data] Attempt ${attempt}/${maxRetries} failed for ${symbol}: ${error.message}`);
      
      if (attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delayMs = Math.pow(2, attempt - 1) * 1000;
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }
  }

  console.error(`[Market Data] Failed to fetch data for ${symbol} after ${maxRetries} attempts:`, lastError.message);
  
  // Return empty array as graceful fallback - allows app to start without this data
  // averageHistoricalVolPerMin will default to 0
  return [];
}

export async function getMarketData(watchlist = [], options = {}) {
  const symbols = watchlist.map((item) => item.symbol).filter(Boolean);

  const results = await Promise.all(symbols.map(async (symbol) => {
    const rows = await fetchHistoricalTradeData(symbol, options);
    const normalizedRows = rows.map(normalizeHistoricalRow);

    return {
      symbol,
      averageVolumePerMinute: normalizedRows.length === 0
        ? 0
        : Number((
            normalizedRows.reduce((sum, row) => sum + getAverageVolumePerMinute(row), 0) /
            normalizedRows.length
          ).toFixed(2)),
      rows: normalizedRows
    };
  }));
  return results;
}

export async function addAverageHistoricalVolPerMin(watchlist = [], options = {}) {
  const historicalData = await getMarketData(watchlist, options);
  const averageBySymbol = new Map(
    historicalData.map((item) => [item.symbol, item.averageVolumePerMinute])
  );

  return watchlist.map((stock) => ({
    ...stock,
    averageHistoricalVolPerMin: averageBySymbol.get(stock.symbol) ?? 0
  }));
}

export { fetchHistoricalTradeData, normalizeHistoricalRow };
