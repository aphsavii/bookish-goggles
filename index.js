import express from 'express';
import { startApp } from './app.js';
import { initializeDatabase } from './data/sqliteClient.js';
import global from './data/global.js';
import { runBacktest } from './functions/backtest/backtestRunner.js';
import { executionEngine } from './functions/engines/executionEngine.js';
import { getLiveFeedSnapshot } from './functions/liveDataHandler.js';
const app = express();
const PORT = 3000;

app.use(express.json());

app.use(express.static("public", {
    setHeaders: (res) => {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
    }
}));
app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
    next();
});

app.get("/", (_req, res) => {
    res.redirect("/dashboard.html");
});

app.get("/api/watchlist/live", (_req, res) => {
    res.json(global.getWatchlist());
});

app.get("/api/index/nifty", (_req, res) => {
    res.json(global.getNifty50());
});

app.get("/api/candles/:symbol", (req, res) => {
    res.json(global.getCandles(req.params.symbol));
});

app.get("/api/signals", (_req, res) => {
    res.json(global.getSignals());
});

app.get("/api/trades", (_req, res) => {
    res.json(global.getTrades());
});

app.post("/api/positions/:symbol/close", (req, res) => {
    try {
        const symbol = String(req.params.symbol || "").trim();
        if (!symbol) {
            res.status(400).json({ error: "Missing symbol" });
            return;
        }

        const openPosition = executionEngine.getOpenPositions().find((position) => position.symbol === symbol);
        if (!openPosition) {
            res.status(404).json({ error: "Position not found" });
            return;
        }

        const requestedExitPrice = Number(req.body?.exitPrice);
        const marketExitPrice = Number.isFinite(requestedExitPrice)
            ? requestedExitPrice
            : Number(global.getWatchlistItem(symbol)?.ltp);

        if (!Number.isFinite(marketExitPrice)) {
            res.status(400).json({ error: "Exit price unavailable" });
            return;
        }

        const closedTrade = executionEngine.closePosition({
            symbol,
            exitPrice: marketExitPrice,
            closedReason: "manual-exit"
        });

        if (!closedTrade) {
            res.status(500).json({ error: "Failed to close position" });
            return;
        }

        global.setTrades(executionEngine.getPaperTrades());
        global.setPositions(executionEngine.getOpenPositions());

        res.json({ success: true, trade: closedTrade });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/api/dashboard", (_req, res) => {
    res.json(global.getStateSnapshot());
});

app.get("/api/feed/raw", (_req, res) => {
    res.json(getLiveFeedSnapshot());
});

app.get("/api/backtest", async (req, res) => {
    try {
        const {
            symbol,
            symbolToken,
            fromDate,
            toDate,
            averageHistoricalVolPerMin,
            marketTrend
        } = req.query;

        if (!symbol || !symbolToken || !fromDate || !toDate) {
            res.status(400).json({
                error: "Missing required query params: symbol, symbolToken, fromDate, toDate"
            });
            return;
        }

        const result = await runBacktest({
            symbol: String(symbol),
            symbolToken: String(symbolToken),
            fromDate: String(fromDate),
            toDate: String(toDate),
            averageHistoricalVolPerMin: Number(averageHistoricalVolPerMin) || 0,
            marketTrend: marketTrend ? String(marketTrend) : "up"
        });

        res.json(result);
    } catch (error) {
        res.status(500).json({
            error: error.message
        });
    }
});

const server = app.listen(PORT, () => {
    console.log(`Server is running on port: ${PORT} (pid: ${process.pid})`);
    startApp().catch((error) => {
        console.error("App startup failed:", error.message);
    });

    initializeDatabase();

});

server.on("error", (error) => {
    if (error.code === "EADDRINUSE") {
        console.error(`Port ${PORT} is already in use. Stop the existing server before starting a new one.`);
        process.exit(1);
    }

    console.error("Server failed to start:", error.message);
    process.exit(1);
});
