import getWatchList from "../functions/watchlist/getWatchList.js";
import { runBacktest } from "../functions/backtest/backtestRunner.js";
import { normalizeBacktestCandles } from "../functions/backtest/normalizeBacktestData.js";
import getBackTestData from "../tests/getBackTestData.js";
import { getExchToken } from "../data/getData.js";
import { getIstDateParts } from "../utils/time.js";

const TREND_SCENARIOS = ["up", "down", "flat"];

function readArg(name, fallback = null) {
  const prefix = `--${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function hasFlag(name) {
  const envName = name.replace(/-/g, "_").toUpperCase();
  return process.argv.includes(`--${name}`) || process.env[envName] === "true";
}

function buildIstDateTime(daysOffset, timeString) {
  const now = new Date();
  const shifted = new Date(now.getTime() + (daysOffset * 24 * 60 * 60 * 1000));
  const parts = getIstDateParts(shifted);
  return `${parts.year}-${parts.month}-${parts.day} ${timeString}`;
}

function getDefaultRange() {
  return {
    fromDate: buildIstDateTime(-1, "09:15"),
    toDate: buildIstDateTime(0, "15:30")
  };
}

function calculateAverageVolumePerMinute(candles = []) {
  if (!candles.length) {
    return 0;
  }

  const totalVolume = candles.reduce((sum, candle) => sum + (Number(candle.volume) || 0), 0);
  return Number((totalVolume / candles.length).toFixed(2));
}

function pad(value, width) {
  return String(value).padEnd(width, " ");
}

function formatMetric(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return "-";
  }

  return Number(value).toFixed(digits);
}

function printScenarioTable(results = []) {
  const headers = ["Symbol", "Trend", "Candles", "Signals", "Trades", "WinRate%", "NetPnL", "MaxDD"];
  const rows = [];

  for (const result of results) {
    if (result.error) {
      rows.push([result.symbol, "error", "-", "-", "-", "-", "-", result.error]);
      continue;
    }

    for (const scenario of result.scenarios ?? []) {
      rows.push([
        result.symbol,
        scenario.marketTrend,
        scenario.counts?.candles ?? 0,
        scenario.counts?.signals ?? 0,
        scenario.counts?.trades ?? 0,
        formatMetric(scenario.metrics?.winRate),
        formatMetric(scenario.metrics?.netPnl),
        formatMetric(scenario.metrics?.maxDrawdown)
      ]);
    }
  }

  const widths = headers.map((header, index) => {
    const rowWidth = Math.max(...rows.map((row) => String(row[index] ?? "").length), 0);
    return Math.max(header.length, rowWidth) + 2;
  });

  const headerLine = headers.map((header, index) => pad(header, widths[index])).join("");
  const separatorLine = widths.map((width) => "-".repeat(width)).join("");

  console.log(headerLine);
  console.log(separatorLine);
  for (const row of rows) {
    console.log(row.map((cell, index) => pad(cell, widths[index])).join(""));
  }
}

async function runSingleSymbolBacktest({ symbol, symbolToken, fromDate, toDate }) {
  const rawPayload = await getBackTestData(symbolToken, fromDate, toDate);
  const candles = normalizeBacktestCandles(rawPayload);
  const averageHistoricalVolPerMin = calculateAverageVolumePerMinute(candles);

  const scenarios = await Promise.all(TREND_SCENARIOS.map(async (marketTrend) => {
    const result = await runBacktest({
      symbol,
      symbolToken,
      fromDate,
      toDate,
      averageHistoricalVolPerMin,
      marketTrend,
      candles: rawPayload
    });

    return {
      marketTrend,
      metrics: result.metrics,
      counts: {
        candles: result.candles.length,
        signals: result.signals.length,
        trades: result.trades.length,
        rejections: result.rejections.length
      },
      trades: result.trades,
      rejections: result.rejections
    };
  }));

  return {
    symbol,
    symbolToken,
    fromDate,
    toDate,
    averageHistoricalVolPerMin,
    candleCount: candles.length,
    scenarios
  };
}

async function main() {
  const symbol = readArg("symbol");
  const symbolToken = readArg("token");
  const fromDateArg = readArg("from");
  const toDateArg = readArg("to");

  const { fromDate, toDate } = (fromDateArg && toDateArg)
    ? { fromDate: fromDateArg, toDate: toDateArg }
    : getDefaultRange();
  const verbose = hasFlag("verbose");

  // Automatic mode: fetch the fresh watchlist and backtest each instrument
  // against up/down/flat trend assumptions over the last 5 days of 1-minute candles.
  if (!symbol && !symbolToken) {
    const watchlist = await getWatchList();
    const results = [];

    for (const instrument of watchlist) {
      const resolvedToken = getExchToken(`${instrument.symbol}-EQ`);
      if (!resolvedToken) {
        results.push({
          symbol: instrument.symbol,
          error: "missing-exchange-token"
        });
        continue;
      }

      try {
        const result = await runSingleSymbolBacktest({
          symbol: instrument.symbol,
          symbolToken: String(resolvedToken),
          fromDate,
          toDate
        });

        results.push(result);
      } catch (error) {
        results.push({
          symbol: instrument.symbol,
          symbolToken: String(resolvedToken),
          fromDate,
          toDate,
          error: error.message
        });
      }
    }

    printScenarioTable(results);
    if (verbose) {
      console.log("");
      console.log(JSON.stringify({
        mode: "auto-watchlist",
        fromDate,
        toDate,
        symbols: results.length,
        results
      }, null, 2));
    }
    return;
  }

  if (!symbol || !symbolToken) {
    console.error("Provide both --symbol and --token, or provide neither to use auto mode.");
    process.exit(1);
  }

  const result = await runSingleSymbolBacktest({
    symbol,
    symbolToken,
    fromDate,
    toDate
  });

  printScenarioTable([result]);
  if (verbose) {
    console.log("");
    console.log(JSON.stringify({
      mode: "single-symbol",
      result
    }, null, 2));
  }
}

main().catch((error) => {
  console.error("Backtest integration failed:", error.message);
  process.exit(1);
});
