import { initializeDatabase, sqliteClient } from "./sqliteClient.js";
import { getIstDate, getIstTimestamp } from "../utils/time.js";

function parseEventRow(row) {
  return {
    eventId: row.event_id,
    tradeDate: row.trade_date,
    timestamp: row.timestamp_ist,
    eventType: row.event_type,
    symbol: row.symbol,
    side: row.side,
    tradeId: row.trade_id,
    status: row.status,
    payload: row.payload_json ? JSON.parse(row.payload_json) : null
  };
}

function sanitizeLimit(value, fallback = 300) {
  const limit = Number(value);
  if (!Number.isFinite(limit) || limit <= 0) {
    return fallback;
  }

  return Math.min(Math.floor(limit), 5000);
}

export function logTradeEvent({
  timestamp = getIstTimestamp(),
  tradeDate = null,
  eventType,
  symbol = null,
  side = null,
  tradeId = null,
  status = null,
  payload = {}
}) {
  if (!eventType) {
    return null;
  }

  initializeDatabase();

  const resolvedTradeDate = tradeDate ?? String(timestamp).slice(0, 10) ?? getIstDate();
  const eventId = `${eventType}-${tradeId ?? symbol ?? "system"}-${String(timestamp).replace(/[^0-9]/g, "")}`;
  const statement = sqliteClient.prepare(`
    INSERT INTO trade_events (
      event_id,
      trade_date,
      timestamp_ist,
      event_type,
      symbol,
      side,
      trade_id,
      status,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  statement.run(
    eventId,
    resolvedTradeDate,
    timestamp,
    eventType,
    symbol,
    side,
    tradeId,
    status,
    JSON.stringify(payload ?? {})
  );

  return eventId;
}

export function getTradeEvents({ date, symbol, eventType, tradeId, limit = 300 } = {}) {
  initializeDatabase();

  const where = [];
  const values = [];

  if (date) {
    where.push("trade_date = ?");
    values.push(date);
  }

  if (symbol) {
    where.push("symbol = ?");
    values.push(symbol);
  }

  if (eventType) {
    where.push("event_type = ?");
    values.push(eventType);
  }

  if (tradeId) {
    where.push("trade_id = ?");
    values.push(tradeId);
  }

  const query = `
    SELECT event_id, trade_date, timestamp_ist, event_type, symbol, side, trade_id, status, payload_json
    FROM trade_events
    ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
    ORDER BY timestamp_ist DESC, id DESC
    LIMIT ?
  `;

  values.push(sanitizeLimit(limit));

  return sqliteClient.prepare(query).all(...values).map(parseEventRow);
}

export function getTradeEventDates(limit = 60) {
  initializeDatabase();

  return sqliteClient.prepare(`
    SELECT trade_date, COUNT(*) AS event_count
    FROM trade_events
    GROUP BY trade_date
    ORDER BY trade_date DESC
    LIMIT ?
  `).all(sanitizeLimit(limit, 60)).map((row) => ({
    tradeDate: row.trade_date,
    eventCount: Number(row.event_count) || 0
  }));
}
