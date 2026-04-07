import getWatchList from "../functions/watchlist/getWatchList.js";
import { loadOpenPositions, loadTrades } from "./tradeStore.js";
import { RISK_CONFIG } from "../config/tradingConfig.js";
import { getIstTimestamp } from "../utils/time.js";
import { getExchToken } from "./getData.js";

function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getFirstNumber(item, keys = []) {
    for (const key of keys) {
        const value = toNumber(item?.[key]);
        if (value !== null) {
            return value;
        }
    }

    return null;
}

class globalDataHandler {
    watchlist = [];
    watchlistTokenMap = new Map();
    nifty50 = null;
    candles = {};
    signals = [];
    trades = [];
    positions = [];
    feedHealth = {
        connected: false,
        status: "disconnected",
        lastMessageAt: null,
        lastActivityAt: null,
        staleAfterMs: 45000,
        reconnectAttempts: 0
    };
    risk = {
        ...RISK_CONFIG,
        availableMargin: RISK_CONFIG.totalMarginAvailable
    };

    async setGlobalData() {
        this.watchlist = await getWatchList();
        this.watchlistTokenMap = new Map();
        for (const item of this.watchlist) {
            const token = getExchToken(`${item.symbol}-EQ`);
            if (token) {
                this.watchlistTokenMap.set(String(token), item.symbol);
                item.exchangeToken = String(token);
            }
        }
        this.nifty50 = null;
        this.trades = loadTrades();
        this.positions = loadOpenPositions();
        const reservedMargin = this.positions.reduce((sum, trade) => sum + (Number(trade.allocatedMargin) || 0), 0);
        this.risk.availableMargin = Math.max(this.risk.totalMarginAvailable - reservedMargin, 0);
    }

    resolveWatchlistSymbolFromFeed(item) {
        if (!item || typeof item !== "object") {
            return null;
        }

        // Neo often sends the initial full packet with `ts`, then incremental updates
        // only with the numeric token. We resolve both shapes to the same watchlist row.
        if (item.ts) {
            return item.ts.replace(/-EQ$/, "");
        }

        if (item.tk) {
            return this.watchlistTokenMap.get(String(item.tk)) ?? null;
        }

        return null;
    }

    updateWatchlistFromLiveFeed(items = []) {
        for (const item of items) {
            const symbol = this.resolveWatchlistSymbolFromFeed(item);
            const watchlistItem = this.watchlist.find((stock) => stock.symbol === symbol);

            if (!watchlistItem) {
                continue;
            }

            const ltp = getFirstNumber(item, ["ltp"]);
            const prevClose = getFirstNumber(item, ["c"]);
            const open = getFirstNumber(item, ["op"]);
            const high = getFirstNumber(item, ["h"]);
            const low = getFirstNumber(item, ["lo"]);
            const absoluteChange = getFirstNumber(item, ["cng"]);
            const percentChange = getFirstNumber(item, ["nc"]);
            const vwap = getFirstNumber(item, ["ap"]);

            if (ltp !== null) watchlistItem.ltp = ltp;
            if (prevClose !== null) watchlistItem.prevClose = prevClose;
            if (open !== null) watchlistItem.open = open;
            if (high !== null) watchlistItem.high = high;
            if (low !== null) watchlistItem.low = low;
            if (vwap !== null) watchlistItem.vwap = vwap;

            // Neo may send either absolute change or percentage change depending on packet shape.
            if (percentChange !== null) {
                watchlistItem.pChange = percentChange;
            } else if (absoluteChange !== null && watchlistItem.prevClose) {
                watchlistItem.pChange = Number(((absoluteChange / watchlistItem.prevClose) * 100).toFixed(2));
            } else if (watchlistItem.ltp && watchlistItem.prevClose) {
                watchlistItem.pChange = Number((((watchlistItem.ltp - watchlistItem.prevClose) / watchlistItem.prevClose) * 100).toFixed(2));
            }

            if (watchlistItem.open !== null && watchlistItem.prevClose !== null && watchlistItem.prevClose !== 0) {
                watchlistItem.gapPct = ((watchlistItem.open - watchlistItem.prevClose) / watchlistItem.prevClose) * 100;
            }

            watchlistItem.lastUpdated = getIstTimestamp();
        }
    }

    updateNiftyFromLiveFeed(items = []) {
        const niftyItem = items.find((item) => item?.name === "if" && item?.tk === "Nifty 50");

        if (!niftyItem) {
            return;
        }
        

        const current = this.nifty50 ?? {};
        const value = getFirstNumber(niftyItem, ["iv"]) ?? current.value ?? null;
        const previousClose = getFirstNumber(niftyItem, ["ic"]) ?? current.previousClose ?? null;
        const absoluteChange = getFirstNumber(niftyItem, ["cng"]);
        const percentChange = getFirstNumber(niftyItem, ["nc"]);
        const open = getFirstNumber(niftyItem, ["openingPrice"]) ?? current.open ?? null;
        const high = getFirstNumber(niftyItem, ["highPrice"]) ?? current.high ?? null;
        const low = getFirstNumber(niftyItem, ["lowPrice"]) ?? current.low ?? null;
        const change = absoluteChange ?? (value !== null && previousClose !== null
            ? Number((value - previousClose).toFixed(2))
            : current.change ?? null);

        this.nifty50 = {
            symbol: niftyItem.tk,
            exchange: niftyItem.e,
            value,
            previousClose,
            change,
            percentChange: percentChange ?? current.percentChange ?? null,
            open,
            high,
            low,
            trend: current.trend ?? "flat",
            lastUpdated: getIstTimestamp()
        };
    }

    setNiftyTrend(trend) {
        if (!this.nifty50) {
            return;
        }

        this.nifty50.trend = trend;
    }

    setCandles(symbol, candles) {
        this.candles[symbol] = candles;
    }

    getCandles(symbol) {
        return this.candles[symbol] ?? [];
    }

    getWatchlistItem(symbol) {
        return this.watchlist.find((item) => item.symbol === symbol) ?? null;
    }

    getWatchlistItemByToken(token) {
        const symbol = this.watchlistTokenMap.get(String(token));
        return symbol ? this.getWatchlistItem(symbol) : null;
    }

    setSignals(signals) {
        this.signals = signals;
    }

    setTrades(trades) {
        this.trades = trades;
    }

    setPositions(positions) {
        this.positions = positions;
        const reservedMargin = positions.reduce((sum, trade) => sum + (Number(trade.allocatedMargin) || 0), 0);
        this.risk.availableMargin = Math.max(this.risk.totalMarginAvailable - reservedMargin, 0);
    }

    getPositions() {
        return this.positions.map((item) => ({ ...item }));
    }

    getRisk() {
        const realizedPnl = this.trades
            .filter((trade) => trade.status === "CLOSED")
            .reduce((sum, trade) => sum + (Number(trade.pnl) || 0), 0);
        const unrealizedPnl = this.positions.reduce((sum, trade) => sum + (Number(trade.unrealizedPnl) || 0), 0);
        const allocatedMargin = this.positions.reduce((sum, trade) => sum + (Number(trade.allocatedMargin) || 0), 0);

        return {
            ...this.risk,
            allocatedMargin,
            realizedPnl,
            unrealizedPnl
        };
    }

    getWatchlist() {
        return this.watchlist.map((item) => ({ ...item }));
    }

    getNifty50() {
        return this.nifty50 ? { ...this.nifty50 } : null;
    }

    getSignals() {
        return this.signals.map((item) => ({ ...item }));
    }

    getTrades() {
        return this.trades.map((item) => ({ ...item }));
    }

    setFeedHealth(feedHealth) {
        this.feedHealth = {
            ...this.feedHealth,
            ...feedHealth
        };
    }

    getFeedHealth() {
        return { ...this.feedHealth };
    }

    getAllCandles() {
        return Object.fromEntries(
            Object.entries(this.candles).map(([symbol, candles]) => [
                symbol,
                candles.map((candle) => ({ ...candle }))
            ])
        );
    }

    getStateSnapshot() {
        return {
            watchlist: this.getWatchlist(),
            nifty50: this.getNifty50(),
            candles: this.getAllCandles(),
            signals: this.getSignals(),
            trades: this.getTrades(),
            positions: this.getPositions(),
            risk: this.getRisk(),
            feedHealth: this.getFeedHealth()
        };
    }

}

export default new globalDataHandler() ;
