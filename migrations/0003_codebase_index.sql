-- Codebase Index table for semantic code intelligence
CREATE TABLE IF NOT EXISTS codebase_index (
  id TEXT PRIMARY KEY,
  repo_full_name TEXT NOT NULL,
  branch TEXT NOT NULL,
  graph_json TEXT NOT NULL,
  indexed_at TEXT NOT NULL DEFAULT (datetime('now')),
  total_files INTEGER NOT NULL DEFAULT 0,
  total_size INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_codebase_repo ON codebase_index(repo_full_name);
