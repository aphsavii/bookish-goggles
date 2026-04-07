export function calculateBacktestMetrics(trades = []) {
  const closedTrades = trades.filter((trade) => trade.status === "CLOSED");
  const winningTrades = closedTrades.filter((trade) => (trade.pnl ?? 0) > 0);
  const losingTrades = closedTrades.filter((trade) => (trade.pnl ?? 0) < 0);
  const grossProfit = winningTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const grossLoss = Math.abs(losingTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0));
  const netPnl = closedTrades.reduce((sum, trade) => sum + (trade.pnl ?? 0), 0);
  const winRate = closedTrades.length === 0
    ? 0
    : Number(((winningTrades.length / closedTrades.length) * 100).toFixed(2));

  let equity = 0;
  let peak = 0;
  let maxDrawdown = 0;
  const equityCurve = closedTrades.map((trade) => {
    equity += trade.pnl ?? 0;
    peak = Math.max(peak, equity);
    maxDrawdown = Math.min(maxDrawdown, equity - peak);

    return {
      timestamp: trade.exitTimestamp ?? trade.timestamp,
      equity: Number(equity.toFixed(2))
    };
  });

  return {
    totalTrades: closedTrades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate,
    grossProfit: Number(grossProfit.toFixed(2)),
    grossLoss: Number(grossLoss.toFixed(2)),
    netPnl: Number(netPnl.toFixed(2)),
    averageWin: winningTrades.length === 0 ? 0 : Number((grossProfit / winningTrades.length).toFixed(2)),
    averageLoss: losingTrades.length === 0 ? 0 : Number((grossLoss / losingTrades.length).toFixed(2)),
    profitFactor: grossLoss === 0 ? null : Number((grossProfit / grossLoss).toFixed(2)),
    maxDrawdown: Number(Math.abs(maxDrawdown).toFixed(2)),
    equityCurve
  };
}
