-- ============================================================================
-- Skema SQLite NusaQuant Futures Lab (pengganti supabase/migrations/*.sql)
-- Konvensi:
--   id UUID        -> TEXT (dibuat di kode via crypto.randomUUID())
--   timestamptz    -> TEXT ISO-8601 UTC (urut leksikografis = urut waktu)
--   numeric(p,s)   -> REAL
--   jsonb          -> TEXT (string JSON; diserialisasi di lapisan db)
--   RLS Supabase   -> TIDAK ADA; akses DB hanya dari kode server + auth operator
-- Tabel arsip yang tidak dipakai (market_plans, opportunity_windows) sengaja
-- tidak dibawa ke SQLite.
-- ============================================================================

CREATE TABLE IF NOT EXISTS bot_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  name TEXT NOT NULL DEFAULT 'Primary bot',
  status TEXT NOT NULL DEFAULT 'IDLE' CHECK (status IN ('IDLE','STARTING','RUNNING','WAITING_APPROVAL','POSITION_OPEN','PAUSED','COOLDOWN','EMERGENCY')),
  mode TEXT NOT NULL DEFAULT 'PAPER_APPROVAL' CHECK (mode IN ('OBSERVATION','PAPER_APPROVAL','PAPER_AUTO','TESTNET','LIVE')),
  symbol TEXT NOT NULL DEFAULT 'BTCUSDT',
  timezone TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  risk_fraction REAL NOT NULL DEFAULT 0.0025 CHECK (risk_fraction > 0 AND risk_fraction <= 0.02),
  daily_loss_limit REAL NOT NULL DEFAULT 0.01 CHECK (daily_loss_limit > 0 AND daily_loss_limit <= 0.1),
  last_signal_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS market_candles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  interval TEXT NOT NULL,
  open_time TEXT NOT NULL,
  open REAL NOT NULL,
  high REAL NOT NULL,
  low REAL NOT NULL,
  close REAL NOT NULL,
  volume REAL NOT NULL,
  quote_volume REAL,
  taker_buy_volume REAL,
  taker_buy_quote_volume REAL,
  trade_count INTEGER,
  source TEXT NOT NULL DEFAULT 'BINANCE',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (symbol, interval, open_time)
);
CREATE INDEX IF NOT EXISTS idx_market_candles_lookup ON market_candles (symbol, interval, open_time);

CREATE TABLE IF NOT EXISTS signal_evaluations (
  id TEXT PRIMARY KEY,
  bot_session_id TEXT NOT NULL REFERENCES bot_sessions(id) ON DELETE CASCADE,
  user_id TEXT,
  symbol TEXT NOT NULL,
  timeframe TEXT NOT NULL DEFAULT '15m',
  decision TEXT NOT NULL DEFAULT 'NO_TRADE' CHECK (decision IN ('LONG','SHORT','NO_TRADE')),
  candidate TEXT NOT NULL DEFAULT 'NO_TRADE' CHECK (candidate IN ('LONG','SHORT','NO_TRADE')),
  stage TEXT NOT NULL DEFAULT 'NO_TRADE' CHECK (stage IN ('TRIGGERED','SETUP','NO_TRADE')),
  timing TEXT NOT NULL DEFAULT 'NO_TRADE' CHECK (timing IN ('ENTER_NOW','WAIT_CONFIRMATION','NO_TRADE')),
  regime TEXT NOT NULL DEFAULT '',
  entry REAL,
  trigger_price REAL,
  quantity REAL,
  stop_loss REAL,
  take_profit REAL,
  risk_reward REAL,
  quality_score REAL,
  position_size REAL,
  risk_amount REAL,
  estimated_costs REAL,
  evidence TEXT,
  blockers TEXT,
  patterns TEXT,
  structure TEXT,
  evaluated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  expires_at TEXT,
  source TEXT NOT NULL DEFAULT 'worker'
);
CREATE INDEX IF NOT EXISTS idx_signal_evaluations_lookup ON signal_evaluations (bot_session_id, symbol, evaluated_at);

CREATE TABLE IF NOT EXISTS paper_orders (
  id TEXT PRIMARY KEY,
  bot_session_id TEXT NOT NULL REFERENCES bot_sessions(id) ON DELETE CASCADE,
  signal_id TEXT,
  client_order_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  order_type TEXT NOT NULL DEFAULT 'SIMULATED_MARKET',
  status TEXT NOT NULL DEFAULT 'FILLED' CHECK (status IN ('NEW','PARTIALLY_FILLED','FILLED','CANCELED','REJECTED','EXPIRED')),
  quantity REAL NOT NULL,
  requested_price REAL,
  filled_price REAL,
  metadata TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS paper_positions (
  id TEXT PRIMARY KEY,
  bot_session_id TEXT NOT NULL REFERENCES bot_sessions(id) ON DELETE CASCADE,
  user_id TEXT,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  status TEXT NOT NULL DEFAULT 'OPEN' CHECK (status IN ('OPEN','CLOSED')),
  quantity REAL NOT NULL,
  entry_price REAL NOT NULL,
  stop_loss REAL NOT NULL,
  take_profit REAL NOT NULL,
  exit_price REAL,
  realized_pnl REAL,
  close_reason TEXT,
  opened_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  closed_at TEXT,
  metadata TEXT
);
-- Satu posisi OPEN per sesi+simbol (menggantikan partial unique index Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS uq_paper_positions_open
  ON paper_positions (bot_session_id, symbol) WHERE status = 'OPEN';
CREATE INDEX IF NOT EXISTS idx_paper_positions_session ON paper_positions (bot_session_id, status, opened_at);

CREATE TABLE IF NOT EXISTS trade_journal (
  id TEXT PRIMARY KEY,
  bot_session_id TEXT REFERENCES bot_sessions(id) ON DELETE SET NULL,
  user_id TEXT,
  paper_position_id TEXT REFERENCES paper_positions(id) ON DELETE SET NULL,
  symbol TEXT NOT NULL,
  action TEXT NOT NULL,
  reason TEXT,
  regime TEXT,
  quality_score REAL,
  payload TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_trade_journal_session ON trade_journal (bot_session_id, created_at);

CREATE TABLE IF NOT EXISTS equity_snapshots (
  id TEXT PRIMARY KEY,
  bot_session_id TEXT NOT NULL REFERENCES bot_sessions(id) ON DELETE CASCADE,
  captured_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  equity REAL NOT NULL,
  realized_pnl REAL NOT NULL DEFAULT 0,
  unrealized_pnl REAL NOT NULL DEFAULT 0,
  drawdown REAL NOT NULL DEFAULT 0,
  daily_loss REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_equity_snapshots_session ON equity_snapshots (bot_session_id, captured_at);

CREATE TABLE IF NOT EXISTS research_backtest_jobs (
  id TEXT PRIMARY KEY,
  symbol TEXT NOT NULL CHECK (symbol IN ('BTCUSDT','ETHUSDT')),
  status TEXT NOT NULL DEFAULT 'QUEUED' CHECK (status IN ('QUEUED','RUNNING','COMPLETED','FAILED')),
  progress INTEGER NOT NULL DEFAULT 0 CHECK (progress BETWEEN 0 AND 100),
  requested_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  started_at TEXT,
  completed_at TEXT,
  result TEXT,
  error TEXT,
  metadata TEXT
);
CREATE INDEX IF NOT EXISTS idx_research_jobs_status ON research_backtest_jobs (status, requested_at);

CREATE TABLE IF NOT EXISTS market_derivatives (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  metric TEXT NOT NULL DEFAULT 'FUNDING_RATE' CHECK (metric IN ('FUNDING_RATE','OPEN_INTEREST')),
  event_time TEXT NOT NULL,
  funding_rate REAL,
  open_interest REAL,
  source TEXT NOT NULL DEFAULT 'BINANCE_PUBLIC',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (symbol, metric, event_time),
  CHECK ((metric = 'FUNDING_RATE' AND funding_rate IS NOT NULL AND open_interest IS NULL)
      OR (metric = 'OPEN_INTEREST' AND open_interest IS NOT NULL AND funding_rate IS NULL))
);
CREATE INDEX IF NOT EXISTS idx_market_derivatives_lookup ON market_derivatives (symbol, metric, event_time);

CREATE TABLE IF NOT EXISTS market_metrics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  symbol TEXT NOT NULL,
  event_time TEXT NOT NULL,
  open_interest REAL NOT NULL,
  open_interest_value REAL NOT NULL,
  top_trader_long_short_ratio REAL NOT NULL,
  top_trader_long_short_position_ratio REAL NOT NULL,
  long_short_ratio REAL NOT NULL,
  taker_long_short_volume_ratio REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'BINANCE_PUBLIC_METRICS',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (symbol, event_time)
);
CREATE INDEX IF NOT EXISTS idx_market_metrics_lookup ON market_metrics (symbol, event_time);

CREATE TABLE IF NOT EXISTS market_radar (
  symbol TEXT PRIMARY KEY,
  last_price REAL,
  day_open REAL,
  prev_range_pct REAL,
  dist_long_pct REAL,
  dist_short_pct REAL,
  touched TEXT,
  regime TEXT,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE IF NOT EXISTS manual_execution_approvals (
  id TEXT PRIMARY KEY,
  mode TEXT NOT NULL CHECK (mode IN ('TESTNET','LIVE')),
  setup_key TEXT NOT NULL,
  symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('LONG','SHORT')),
  operator_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'RESERVED' CHECK (status IN ('RESERVED','VERIFIED','REVIEW')),
  exchange_entry_id TEXT,
  exchange_sl_id TEXT,
  exchange_tp_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (mode, setup_key)
);
-- Satu approval tak terselesaikan per mode (menggantikan partial unique index Postgres).
CREATE UNIQUE INDEX IF NOT EXISTS uq_manual_approvals_unresolved
  ON manual_execution_approvals (mode) WHERE status IN ('RESERVED','REVIEW');

-- updated_at otomatis (menggantikan trigger Postgres).
-- Dipakai AFTER UPDATE + penjaga WHEN supaya tidak rekursi walau recursive_triggers ON.
CREATE TRIGGER IF NOT EXISTS trg_bot_sessions_updated
  AFTER UPDATE ON bot_sessions FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
  BEGIN UPDATE bot_sessions SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;

CREATE TRIGGER IF NOT EXISTS trg_manual_approvals_updated
  AFTER UPDATE ON manual_execution_approvals FOR EACH ROW
  WHEN OLD.updated_at = NEW.updated_at
  BEGIN UPDATE manual_execution_approvals SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = NEW.id; END;
