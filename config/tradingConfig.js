export const WATCHLIST_CONFIG = {
  minPrice: 10,
  maxPrice: 1000,
  maxInstruments: 5
};

export const RISK_CONFIG = {
  totalMarginAvailable: 100000,
  maxMarginPerTrade: 25000,
  maxTradesPerDay: 5,
  maxLossPerTrade: 1000,
  maxLossPerDay: 3000,
  stopLossPct: 1,
  rewardToRiskRatio: 2,
  duplicateSignalCooldownMinutes: 5,
  maxOpenPositions: 3
};

export const SIGNAL_CONFIG = {
  breakoutLookback: 3,
  historicalVolumeConfirmationMultiplier: 1.5,
  todayVolumeAccelerationMultiplier: 1.2,
  minTodayVolumeSamples: 5,
  volumeConfirmationMode: "either",
  duplicateSignalCooldownMinutes: 5
};

export const LIVE_FEED_CONFIG = {
  reconnectBaseDelayMs: 500,
  reconnectMaxDelayMs: 10000,
  staleAfterMs: 45000,
  healthCheckIntervalMs: 5000
};

export const TREND_CONFIG = {
  niftyLookbackCandles: 5
};

export const SESSION_CONFIG = {
  noNewEntriesBefore: "09:50:00",
  noNewEntriesAfter: "15:00:00",
  squareOffAt: "15:09:00"
};

export const ORDER_SIMULATION_CONFIG = {
  entrySlippageBps: 5,
  exitSlippageBps: 5,
  assumedFillStatus: "FILLED",
  moveStopToBreakevenAtR: 0.5,
  trailingStopStepAtR: 1,
  trailingStopLockR: 0.5
};
