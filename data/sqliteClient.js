import fs from "fs";
import path from "path";
import { DatabaseSync } from "node:sqlite";

const isTestEnvironment =
  process.env.NODE_ENV === "test" ||
  process.argv.includes("--test") ||
  process.execArgv.includes("--test");

const dataDir = path.join(process.cwd(), "data");
const databasePath = isTestEnvironment
  ? ":memory:"
  : path.join(dataDir, "trade.sqlite");

if (!isTestEnvironment && !fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const sqliteClient = new DatabaseSync(databasePath);
let databaseInitialized = false;

function getColumnNames(tableName) {
  const rows = sqliteClient.prepare(`PRAGMA table_info(${tableName})`).all();
  return new Set(rows.map((row) => row.name));
}

function ensureColumn(tableName, columnName, definition) {
  const columns = getColumnNames(tableName);

  if (!columns.has(columnName)) {
    sqliteClient.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
  }
}

export function initializeDatabase() {
  if (databaseInitialized) {
    return;
  }

  sqliteClient.exec(`
    CREATE TABLE IF NOT EXISTS trades (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trade_id TEXT,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      target REAL,
      quantity INTEGER NOT NULL,
      risk_amount REAL NOT NULL,
      allocated_margin REAL,
      strategy TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      requested_entry REAL,
      exit_price REAL,
      requested_exit_price REAL,
      exit_timestamp TEXT,
      pnl REAL,
      closed_reason TEXT,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS positions (
      trade_id TEXT,
      symbol TEXT PRIMARY KEY,
      side TEXT NOT NULL,
      entry REAL NOT NULL,
      stop_loss REAL NOT NULL,
      target REAL,
      quantity INTEGER NOT NULL,
      risk_amount REAL NOT NULL,
      allocated_margin REAL,
      strategy TEXT NOT NULL,
      trade_date TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      current_price REAL,
      unrealized_pnl REAL,
      status TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );
  `);

  ensureColumn("trades", "trade_id", "TEXT");
  ensureColumn("trades", "target", "REAL");
  ensureColumn("trades", "allocated_margin", "REAL");
  ensureColumn("trades", "requested_entry", "REAL");
  ensureColumn("trades", "exit_price", "REAL");
  ensureColumn("trades", "requested_exit_price", "REAL");
  ensureColumn("trades", "exit_timestamp", "TEXT");
  ensureColumn("trades", "pnl", "REAL");
  ensureColumn("trades", "closed_reason", "TEXT");
  ensureColumn("trades", "updated_at", "TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP");

  ensureColumn("positions", "trade_id", "TEXT");
  ensureColumn("positions", "target", "REAL");
  ensureColumn("positions", "allocated_margin", "REAL");
  ensureColumn("positions", "current_price", "REAL");
  ensureColumn("positions", "unrealized_pnl", "REAL");

  databaseInitialized = true;
  if (!isTestEnvironment) {
    console.log(`SQLite ready: ${databasePath}`);
  }
}

export { databasePath, sqliteClient };
