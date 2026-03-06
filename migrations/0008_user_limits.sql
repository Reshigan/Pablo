-- BUG-2: Create user_limits table for per-user daily budget enforcement
-- d1-costs.ts references this table but no migration created it
CREATE TABLE IF NOT EXISTS user_limits (
  user_id TEXT PRIMARY KEY,
  daily_budget_usd REAL NOT NULL DEFAULT 5.0,
  total_spent_today_usd REAL NOT NULL DEFAULT 0,
  last_reset TEXT NOT NULL DEFAULT (datetime('now'))
);
