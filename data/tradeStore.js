import { initializeDatabase, sqliteClient } from "./sqliteClient.js";

function parseRowPayload(row) {
  return row?.payload_json ? JSON.parse(row.payload_json) : null;
}

export function loadTrades() {
  initializeDatabase();
  const statement = sqliteClient.prepare(`
    SELECT payload_json
    FROM trades
    ORDER BY id ASC
  `);

  return statement.all().map(parseRowPayload).filter(Boolean);
}

export function loadOpenPositions() {
  initializeDatabase();
  const statement = sqliteClient.prepare(`
    SELECT payload_json
    FROM positions
    ORDER BY symbol ASC
  `);

  return statement.all().map(parseRowPayload).filter(Boolean);
}

export function saveTrade(trade) {
  initializeDatabase();

  const insertTrade = sqliteClient.prepare(`
    INSERT INTO trades (
      trade_id,
      symbol,
      side,
      entry,
      stop_loss,
      target,
      quantity,
      risk_amount,
      allocated_margin,
      strategy,
      trade_date,
      timestamp,
      requested_entry,
      exit_price,
      requested_exit_price,
      exit_timestamp,
      pnl,
      closed_reason,
      status,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const upsertPosition = sqliteClient.prepare(`
    INSERT INTO positions (
      trade_id,
      symbol,
      side,
      entry,
      stop_loss,
      target,
      quantity,
      risk_amount,
      allocated_margin,
      strategy,
      trade_date,
      timestamp,
      current_price,
      unrealized_pnl,
      status,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      trade_id = excluded.trade_id,
      side = excluded.side,
      entry = excluded.entry,
      stop_loss = excluded.stop_loss,
      target = excluded.target,
      quantity = excluded.quantity,
      risk_amount = excluded.risk_amount,
      allocated_margin = excluded.allocated_margin,
      strategy = excluded.strategy,
      trade_date = excluded.trade_date,
      timestamp = excluded.timestamp,
      current_price = excluded.current_price,
      unrealized_pnl = excluded.unrealized_pnl,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  insertTrade.run(
    trade.tradeId ?? null,
    trade.symbol,
    trade.side,
    trade.entry,
    trade.stopLoss,
    trade.target ?? null,
    trade.quantity,
    trade.riskAmount,
    trade.allocatedMargin ?? null,
    trade.strategy,
    trade.tradeDate,
    trade.timestamp,
    trade.requestedEntry ?? null,
    trade.exitPrice ?? null,
    trade.requestedExitPrice ?? null,
    trade.exitTimestamp ?? null,
    trade.pnl ?? null,
    trade.closedReason ?? null,
    trade.status,
    JSON.stringify(trade)
  );

  upsertPosition.run(
    trade.tradeId ?? null,
    trade.symbol,
    trade.side,
    trade.entry,
    trade.stopLoss,
    trade.target ?? null,
    trade.quantity,
    trade.riskAmount,
    trade.allocatedMargin ?? null,
    trade.strategy,
    trade.tradeDate,
    trade.timestamp,
    trade.currentPrice ?? trade.entry,
    trade.unrealizedPnl ?? 0,
    trade.status,
    JSON.stringify(trade)
  );
}

export function updateTrade(trade) {
  initializeDatabase();

  const updateTradeStatement = sqliteClient.prepare(`
    UPDATE trades
    SET
      entry = ?,
      stop_loss = ?,
      target = ?,
      quantity = ?,
      risk_amount = ?,
      allocated_margin = ?,
      strategy = ?,
      trade_date = ?,
      timestamp = ?,
      requested_entry = ?,
      exit_price = ?,
      requested_exit_price = ?,
      exit_timestamp = ?,
      pnl = ?,
      closed_reason = ?,
      status = ?,
      payload_json = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE trade_id = ?
  `);

  updateTradeStatement.run(
    trade.entry,
    trade.stopLoss,
    trade.target ?? null,
    trade.quantity,
    trade.riskAmount,
    trade.allocatedMargin ?? null,
    trade.strategy,
    trade.tradeDate,
    trade.timestamp,
    trade.requestedEntry ?? null,
    trade.exitPrice ?? null,
    trade.requestedExitPrice ?? null,
    trade.exitTimestamp ?? null,
    trade.pnl ?? null,
    trade.closedReason ?? null,
    trade.status,
    JSON.stringify(trade),
    trade.tradeId
  );
}

export function upsertPosition(position) {
  initializeDatabase();

  const statement = sqliteClient.prepare(`
    INSERT INTO positions (
      trade_id,
      symbol,
      side,
      entry,
      stop_loss,
      target,
      quantity,
      risk_amount,
      allocated_margin,
      strategy,
      trade_date,
      timestamp,
      current_price,
      unrealized_pnl,
      status,
      payload_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(symbol) DO UPDATE SET
      trade_id = excluded.trade_id,
      side = excluded.side,
      entry = excluded.entry,
      stop_loss = excluded.stop_loss,
      target = excluded.target,
      quantity = excluded.quantity,
      risk_amount = excluded.risk_amount,
      allocated_margin = excluded.allocated_margin,
      strategy = excluded.strategy,
      trade_date = excluded.trade_date,
      timestamp = excluded.timestamp,
      current_price = excluded.current_price,
      unrealized_pnl = excluded.unrealized_pnl,
      status = excluded.status,
      payload_json = excluded.payload_json,
      updated_at = CURRENT_TIMESTAMP
  `);

  statement.run(
    position.tradeId ?? null,
    position.symbol,
    position.side,
    position.entry,
    position.stopLoss,
    position.target ?? null,
    position.quantity,
    position.riskAmount,
    position.allocatedMargin ?? null,
    position.strategy,
    position.tradeDate,
    position.timestamp,
    position.currentPrice ?? position.entry,
    position.unrealizedPnl ?? 0,
    position.status,
    JSON.stringify(position)
  );
}

export function deletePosition(symbol) {
  initializeDatabase();
  sqliteClient.prepare("DELETE FROM positions WHERE symbol = ?").run(symbol);
}
