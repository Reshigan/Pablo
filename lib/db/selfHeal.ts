/**
 * Self-Healing Schema — automatically ensures all required tables and columns
 * exist in D1. Runs on first API call; idempotent and safe to call repeatedly.
 *
 * If a table is missing, it is created. If a column is missing, it is added
 * via ALTER TABLE. Errors for "already exists" are silently ignored.
 */

interface D1Binding {
  prepare: (sql: string) => { run: () => Promise<unknown>; all: () => Promise<{ results: Record<string, unknown>[] }> };
}

let healed = false;

/**
 * All required tables with their CREATE TABLE statements.
 * Uses CREATE TABLE IF NOT EXISTS so it's safe to run repeatedly.
 */
const TABLE_DEFINITIONS = [
  `CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    title TEXT NOT NULL DEFAULT 'Untitled Session',
    repo_url TEXT,
    repo_branch TEXT DEFAULT 'main',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    status TEXT NOT NULL DEFAULT 'active',
    metadata TEXT,
    snapshot TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    content TEXT NOT NULL,
    model TEXT,
    tokens INTEGER,
    duration_ms INTEGER,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS files (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    name TEXT NOT NULL,
    content TEXT NOT NULL DEFAULT '',
    language TEXT DEFAULT 'plaintext',
    is_directory INTEGER NOT NULL DEFAULT 0,
    parent_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
    feature_description TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    current_stage TEXT DEFAULT 'plan',
    plan_output TEXT, db_output TEXT, api_output TEXT, ui_output TEXT,
    tests_output TEXT, execute_output TEXT, review_output TEXT,
    total_tokens INTEGER DEFAULT 0,
    total_duration_ms INTEGER DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS pipeline_stages (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
    stage TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    input TEXT, output TEXT, model TEXT,
    tokens INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0,
    error TEXT, started_at TEXT, completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS patterns (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE SET NULL,
    type TEXT NOT NULL,
    trigger_text TEXT NOT NULL,
    action TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 0.5,
    usage_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS domain_kb (
    id TEXT PRIMARY KEY,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT, source TEXT,
    confidence REAL NOT NULL DEFAULT 0.8,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS secrets (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    filename TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    content TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS llm_calls (
    id TEXT PRIMARY KEY,
    session_id TEXT,
    model TEXT NOT NULL,
    tokens_in INTEGER NOT NULL DEFAULT 0,
    tokens_out INTEGER NOT NULL DEFAULT 0,
    duration_ms INTEGER NOT NULL DEFAULT 0,
    cost_usd REAL NOT NULL DEFAULT 0,
    source TEXT DEFAULT 'chat',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS agent_runs (
    id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    orchestration_id TEXT NOT NULL,
    agent_name TEXT NOT NULL,
    phase TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'running',
    input_summary TEXT DEFAULT '',
    output_summary TEXT DEFAULT '',
    files_generated INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    duration_ms INTEGER DEFAULT 0,
    issues TEXT DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  )`,
  `CREATE TABLE IF NOT EXISTS playbooks (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    trigger_pattern TEXT DEFAULT '',
    steps_json TEXT NOT NULL DEFAULT '[]',
    created_by TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,
  `CREATE TABLE IF NOT EXISTS codebase_index (
    id TEXT PRIMARY KEY,
    repo_full_name TEXT NOT NULL,
    branch TEXT NOT NULL,
    graph_json TEXT NOT NULL,
    indexed_at TEXT NOT NULL,
    total_files INTEGER DEFAULT 0,
    total_size INTEGER DEFAULT 0
  )`,
];

/**
 * Columns that may be missing from older tables (ALTER TABLE migrations).
 * Each entry: [table, column, type + default]
 */
const COLUMN_PATCHES: Array<[string, string, string]> = [
  ['sessions', 'user_id', 'TEXT'],
  ['sessions', 'snapshot', 'TEXT'],
  ['sessions', 'metadata', 'TEXT'],
];

/**
 * Get raw D1 binding from Cloudflare context.
 */
async function getRawD1(): Promise<D1Binding | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    return (env.DB as D1Binding) ?? null;
  } catch {
    return null;
  }
}

/**
 * Run self-healing schema check. Idempotent — safe to call on every request.
 * Uses an in-memory flag to only run once per Worker instance lifetime.
 */
export async function ensureSchema(): Promise<void> {
  if (healed) return;

  const d1 = await getRawD1();
  if (!d1) return; // No D1 binding — skip (local dev)

  try {
    // 1. Create all tables (IF NOT EXISTS)
    for (const sql of TABLE_DEFINITIONS) {
      try {
        await d1.prepare(sql).run();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('already exists')) {
          console.error('[selfHeal] Table creation error:', msg);
        }
      }
    }

    // 2. Patch missing columns
    for (const [table, column, type] of COLUMN_PATCHES) {
      try {
        await d1.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`).run();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.includes('duplicate') && !msg.includes('already exists')) {
          console.error(`[selfHeal] ALTER TABLE ${table} ADD ${column}: ${msg}`);
        }
      }
    }

    healed = true;
    console.log('[selfHeal] Schema check complete');
  } catch (err) {
    console.error('[selfHeal] Unexpected error:', err instanceof Error ? err.message : err);
  }
}
