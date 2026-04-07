import { getExchToken } from "../data/getData.js";
import global from "../data/global.js";
import { createLiveFeedClient } from "../socketConnection.js";
import { candleEngine } from "./engines/candleEngine.js";
import { signalEngine } from "./engines/signalEngine.js";
import { riskControlEngine } from "./engines/riskControlEngine.js";
import { executionEngine } from "./engines/executionEngine.js";
import { LIVE_FEED_CONFIG, TREND_CONFIG, SESSION_CONFIG } from "../config/tradingConfig.js";
import { getIstTimestamp, isIstTimeOnOrAfter } from "../utils/time.js";

const liveFeedClient = createLiveFeedClient();
const isDebugFeedEnabled = process.env.DEBUG_FEED === "true";

let reconnectTimer = null;
let reconnectAttempts = 0;
let manualStop = false;
const liveFeedState = {
  equities: new Map(),
  indices: new Map(),
  depth: new Map(),
  system: []
};
let healthCheckTimer = null;
let sessionSquareOffCompleted = false;

function getFeedKey(item) {
  return item.tk || item.ts || item.name || JSON.stringify(item);
}

function classifyFeedItem(item) {
  if (!item || typeof item !== "object") {
    return "unknown";
  }

  if (item.type || item.stat) {
    return "system";
  }

  if (item.name === "sf") {
    return "equity";
  }

  if (item.name === "if") {
    return "index";
  }

  if (item.name === "dp") {
    return "depth";
  }

  return "unknown";
}

function updateLiveFeedState(items) {
  for (const item of items) {
    const feedType = classifyFeedItem(item);
    const key = getFeedKey(item);

    if (feedType === "equity") {
      const existing = liveFeedState.equities.get(key) ?? {};
      liveFeedState.equities.set(key, { ...existing, ...item });
      continue;
    }

    if (feedType === "index") {
      const existing = liveFeedState.indices.get(key) ?? {};
      liveFeedState.indices.set(key, { ...existing, ...item });
      continue;
    }

    if (feedType === "depth") {
      liveFeedState.depth.set(key, item);
      continue;
    }

    liveFeedState.system.push(item);
    if (liveFeedState.system.length > 50) {
      liveFeedState.system.shift();
    }
  }
}

function debugFeedLog(...args) {
  if (isDebugFeedEnabled) {
    console.log(...args);
  }
}

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function processTradingEngines(equityItems) {
  for (const item of equityItems) {
    const symbol = global.resolveWatchlistSymbolFromFeed(item);
    const ltp = toNumber(item.ltp);
    const cumulativeVolume = toNumber(item.v);
    const instrument = global.getWatchlistItem(symbol);

    if (!symbol || !instrument || ltp === null) {
      continue;
    }

    const { closedTrade, positionUpdated } = executionEngine.updateMarketPrice({
      symbol,
      ltp,
      timestamp: global.getWatchlistItem(symbol)?.lastUpdated
    });

    // Keep API/dashboard state in sync with live tick-by-tick position changes,
    // even when the trade stays open and only current price / stop loss move.
    if (positionUpdated) {
      global.setTrades(executionEngine.getPaperTrades());
      global.setPositions(executionEngine.getOpenPositions());
    }

    if (closedTrade) {
      console.log(
        `Closed paper trade: ${closedTrade.symbol} ${closedTrade.side} ${closedTrade.closedReason} pnl=${closedTrade.pnl}`
      );
    }

    const { closedCandle } = candleEngine.processTick({
      symbol,
      ltp,
      cumulativeVolume
    });

    global.setCandles(symbol, candleEngine.getCandles(symbol));

    if (!closedCandle) {
      continue;
    }

    const signal = signalEngine.evaluateBreakout({
      candle: closedCandle,
      previousCandles: candleEngine.getCandles(symbol).slice(0, -1),
      instrument,
      openPositions: executionEngine.getOpenPositions()
    });

    if (!signal) {
      continue;
    }

    const riskDecision = riskControlEngine.validateSignal({
      signal,
      openPositions: executionEngine.getOpenPositions(),
      marketTrend: global.getNifty50()?.trend ?? "flat",
      riskConfig: global.getRisk(),
      allTrades: executionEngine.getPaperTrades()
    });

    if (!riskDecision.approved) {
      continue;
    }

    const trade = executionEngine.execute({ signal, riskDecision });

    if (trade) {
      global.setSignals(signalEngine.getSignals());
      global.setTrades(executionEngine.getPaperTrades());
      global.setPositions(executionEngine.getOpenPositions());
      console.log(
        `Executed paper trade: ${trade.symbol} ${trade.side} entry=${trade.entry} stop=${trade.stopLoss} target=${trade.target} qty=${trade.quantity}`
      );
    }
  }
}

function maybeAutoSquareOff() {
  if (sessionSquareOffCompleted || !isIstTimeOnOrAfter(SESSION_CONFIG.squareOffAt)) {
    return;
  }

  const closedTrades = executionEngine.squareOffOpenPositions({
    exitTimestamp: getIstTimestamp(),
    getExitPrice: (symbol) => global.getWatchlistItem(symbol)?.ltp,
    closedReason: "session-square-off"
  });

  sessionSquareOffCompleted = true;

  if (closedTrades.length > 0) {
    global.setTrades(executionEngine.getPaperTrades());
    global.setPositions(executionEngine.getOpenPositions());
    console.log(`Auto square-off executed for ${closedTrades.length} position(s)`);
  }
}

function updateIndexCandles(indexItems) {
  for (const item of indexItems) {
    if (item?.tk !== "Nifty 50") {
      continue;
    }

    const value = toNumber(item.iv);
    if (value === null) {
      continue;
    }

    const symbol = "NIFTY50";
    const { closedCandle } = candleEngine.processTick({
      symbol,
      ltp: value,
      cumulativeVolume: null
    });

    const existingCandles = global.getCandles(symbol);
    const latestCandles = closedCandle
      ? [...existingCandles, closedCandle].slice(-20)
      : existingCandles;

    global.setCandles(symbol, latestCandles);
  }
}

function getNiftyTrendFromCandles() {
  const candles = global.getCandles("NIFTY50");

  if (candles.length < TREND_CONFIG.niftyLookbackCandles) {
    return "flat";
  }

  const recentCandles = candles.slice(-TREND_CONFIG.niftyLookbackCandles);
  const closes = recentCandles.map((candle) => candle.close);
  const highs = recentCandles.map((candle) => candle.high);
  const lows = recentCandles.map((candle) => candle.low);

  const firstClose = closes[0];
  const lastClose = closes[closes.length - 1];
  const higherHighs = highs[highs.length - 1] > highs[0];
  const higherLows = lows[lows.length - 1] > lows[0];
  const lowerHighs = highs[highs.length - 1] < highs[0];
  const lowerLows = lows[lows.length - 1] < lows[0];

  if (lastClose > firstClose && higherHighs && higherLows) {
    return "up";
  }

  if (lastClose < firstClose && lowerHighs && lowerLows) {
    return "down";
  }

  return "flat";
}

function clearReconnectTimer() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
}

function clearHealthCheckTimer() {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

function startHealthMonitoring() {
  clearHealthCheckTimer();

  healthCheckTimer = setInterval(() => {
    const feedHealth = global.getFeedHealth();
    const lastMessageAt = feedHealth.lastMessageAt ? new Date(feedHealth.lastMessageAt).getTime() : null;
    const now = Date.now();
    const isStale = !lastMessageAt || (now - lastMessageAt) > LIVE_FEED_CONFIG.staleAfterMs;

    global.setFeedHealth({
      status: global.getFeedHealth().connected
        ? (isStale ? "stale" : "healthy")
        : "disconnected"
    });
  }, LIVE_FEED_CONFIG.healthCheckIntervalMs);
}

function getReconnectDelay() {
  const delay = LIVE_FEED_CONFIG.reconnectBaseDelayMs * (2 ** reconnectAttempts);
  return Math.min(delay, LIVE_FEED_CONFIG.reconnectMaxDelayMs);
}

function connectLiveFeed() {
  clearReconnectTimer();

  try {
    liveFeedClient.connect();
  } catch (error) {
    console.error("Socket setup failed:", error.message);
    scheduleReconnect("connect-failed");
  }
}

function scheduleReconnect(reason) {
  if (manualStop || reconnectTimer || liveFeedClient.isConnected()) {
    return;
  }

  const delay = getReconnectDelay();
  reconnectAttempts += 1;

  console.warn(`Socket reconnect scheduled in ${delay}ms (${reason})`);

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connectLiveFeed();
  }, delay);
}

liveFeedClient.on("open", () => {
  clearReconnectTimer();
  reconnectAttempts = 0;
  const timestamp = new Date().toISOString();
  global.setFeedHealth({
    connected: true,
    status: "healthy",
    reconnectAttempts,
    lastActivityAt: timestamp
  });
  startHealthMonitoring();
  console.log("Connected to Live Feed");
});

liveFeedClient.on("parsed", (payload) => {
  const items = Array.isArray(payload) ? payload : [payload];
  const timestamp = new Date().toISOString();
  global.setFeedHealth({
    lastMessageAt: timestamp,
    lastActivityAt: timestamp,
    status: "healthy"
  });
  updateLiveFeedState(items);
  debugFeedLog("Socket parsed payload:", items);

  const equityItems = items.filter((item) => classifyFeedItem(item) === "equity");
  const indexItems = items.filter((item) => classifyFeedItem(item) === "index");

  if (equityItems.length > 0) {
    global.updateWatchlistFromLiveFeed(equityItems);
    processTradingEngines(equityItems);
    maybeAutoSquareOff();
  }

  if (indexItems.length > 0) {
    updateIndexCandles(indexItems);
    global.updateNiftyFromLiveFeed(indexItems);
    if (global.getNifty50()) {
      global.setNiftyTrend(getNiftyTrendFromCandles());
    }
  }
});

liveFeedClient.on("error", (error) => {
  console.error("Socket error event:", error);
});

liveFeedClient.on("close", (event) => {
  const code = event?.code ?? "unknown";
  const reason = event?.reason || "none";
  global.setFeedHealth({
    connected: false,
    status: "disconnected",
    reconnectAttempts: reconnectAttempts + 1
  });
  clearHealthCheckTimer();
  console.warn(`Socket closed: code=${code}, reason=${reason}`);
  scheduleReconnect(`close:${code}`);
});

export function startLiveDataHandler(watchlist) {
  const symbols = watchlist.map((stock) => stock.symbol);
  manualStop = false;
  sessionSquareOffCompleted = false;

  let scrips = "";
  symbols.forEach((symbol) => {
    const exchToken = getExchToken(symbol + "-EQ");
    if (exchToken) {
      scrips += `&nse_cm|${exchToken}`;
    }
  });

  scrips = scrips.slice(1);

  if (scrips) {
    liveFeedClient.subscribe("mws", scrips, 1);
  }

  liveFeedClient.subscribe("ifs", "nse_cm|Nifty 50", 2);
  global.setFeedHealth({
    staleAfterMs: LIVE_FEED_CONFIG.staleAfterMs,
    reconnectAttempts
  });
  connectLiveFeed();
  return liveFeedClient;
}

export function stopLiveDataHandler() {
  manualStop = true;
  clearReconnectTimer();
  clearHealthCheckTimer();
  global.setFeedHealth({
    connected: false,
    status: "stopped"
  });
  liveFeedClient.disconnect();
}

export function getLiveFeedSnapshot() {
  return {
    equities: Object.fromEntries(liveFeedState.equities),
    indices: Object.fromEntries(liveFeedState.indices),
    depth: Object.fromEntries(liveFeedState.depth),
    system: [...liveFeedState.system]
  };
}

export { liveFeedClient };
