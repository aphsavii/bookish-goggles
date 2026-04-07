function toNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeArrayCandle(row = []) {
  const [timestamp, open, high, low, close, volume] = row;

  return {
    timestamp: String(timestamp),
    open: toNumber(open),
    high: toNumber(high),
    low: toNumber(low),
    close: toNumber(close),
    volume: toNumber(volume) ?? 0
  };
}

function normalizeObjectCandle(row = {}) {
  return {
    timestamp: String(
      row.timestamp ??
      row.time ??
      row.datetime ??
      row.date ??
      row[0] ??
      ""
    ),
    open: toNumber(row.open ?? row.o ?? row[1]),
    high: toNumber(row.high ?? row.h ?? row[2]),
    low: toNumber(row.low ?? row.l ?? row[3]),
    close: toNumber(row.close ?? row.c ?? row[4]),
    volume: toNumber(row.volume ?? row.v ?? row[5]) ?? 0
  };
}

export function normalizeBacktestCandles(payload) {
  const sourceRows = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.data)
      ? payload.data
      : Array.isArray(payload?.data?.candles)
        ? payload.data.candles
        : [];

  return sourceRows
    .map((row) => Array.isArray(row) ? normalizeArrayCandle(row) : normalizeObjectCandle(row))
    .filter((row) =>
      row.timestamp &&
      Number.isFinite(row.open) &&
      Number.isFinite(row.high) &&
      Number.isFinite(row.low) &&
      Number.isFinite(row.close)
    )
    .sort((left, right) => new Date(left.timestamp) - new Date(right.timestamp));
}
