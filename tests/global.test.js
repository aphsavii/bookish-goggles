import test from "node:test";
import assert from "node:assert/strict";
import global from "../data/global.js";

test("global watchlist updates resolve incremental websocket packets by token", () => {
  const originalWatchlist = global.watchlist;
  const originalTokenMap = global.watchlistTokenMap;

  try {
    global.watchlist = [{
      symbol: "ADANIPOWER",
      prevClose: 159.97,
      open: 162
    }];
    global.watchlistTokenMap = new Map([["17388", "ADANIPOWER"]]);

    global.updateWatchlistFromLiveFeed([{
      tk: "17388",
      ltp: "163.37",
      cng: "3.40",
      nc: "2.13",
      ap: "162.93",
      v: "107111592"
    }]);

    assert.equal(global.watchlist[0].ltp, 163.37);
    assert.equal(global.watchlist[0].pChange, 2.13);
    assert.equal(global.watchlist[0].vwap, 162.93);
    assert.match(global.watchlist[0].lastUpdated, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  } finally {
    global.watchlist = originalWatchlist;
    global.watchlistTokenMap = originalTokenMap;
  }
});
