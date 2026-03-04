-- Playbooks table for reusable task templates
CREATE TABLE IF NOT EXISTS playbooks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  trigger_pattern TEXT,
  steps_json TEXT NOT NULL,
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  usage_count INTEGER DEFAULT 0
);
