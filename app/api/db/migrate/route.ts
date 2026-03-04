import { auth } from '@/lib/auth';

// Individual CREATE TABLE statements (D1 exec can fail with multi-statement SQL)
const MIGRATION_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Session',
  repo_url TEXT,
  repo_branch TEXT DEFAULT 'main',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','error')),
  metadata TEXT
)`,
  `CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
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
  // v2: add snapshot column to sessions
  `ALTER TABLE sessions ADD COLUMN snapshot TEXT`,
  // v3: SEC-03 multi-tenancy — add user_id to sessions
  `ALTER TABLE sessions ADD COLUMN user_id TEXT`,
  // v3: tables for cost tracking, agent runs, playbooks, codebase index
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
  `CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`,
];

interface D1Binding {
  prepare: (sql: string) => { run: () => Promise<unknown>; first: () => Promise<unknown> };
  exec: (sql: string) => Promise<unknown>;
}

/**
 * Get raw D1 binding from Cloudflare context
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
 * POST /api/db/migrate — Run D1 schema migration using raw D1 binding
 */
export async function POST() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const d1 = await getRawD1();
  if (!d1) {
    return Response.json({ status: 'skipped', message: 'D1 not available (no DB binding)' });
  }

  const results: Array<{ statement: string; status: string; error?: string }> = [];

  for (const sql of MIGRATION_STATEMENTS) {
    const label = sql.slice(0, 60).replace(/\n/g, ' ').trim();
    try {
      await d1.prepare(sql).run();
      results.push({ statement: label, status: 'ok' });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // "duplicate column" or "already exists" are expected for ALTER TABLE
      if (msg.includes('duplicate') || msg.includes('already exists')) {
        results.push({ statement: label, status: 'skipped (already exists)' });
      } else {
        results.push({ statement: label, status: 'error', error: msg });
      }
    }
  }

  const hasErrors = results.some(r => r.status === 'error');
  return Response.json({
    status: hasErrors ? 'partial' : 'ok',
    message: `Migration complete: ${results.filter(r => r.status === 'ok').length} applied, ${results.filter(r => r.status.startsWith('skipped')).length} skipped, ${results.filter(r => r.status === 'error').length} errors`,
    results,
  });
}

/**
 * GET /api/db/migrate — Diagnostic: check D1 availability and binding status
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  // Diagnostic: try to access D1 and report what we find
  const diag: Record<string, unknown> = {
    tables: ['sessions', 'messages', 'files', 'pipeline_runs', 'pipeline_stages', 'patterns', 'domain_kb', 'settings', 'attachments'],
  };

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const env = ctx.env as Record<string, unknown>;
    diag.cfContextAvailable = true;
    diag.envKeys = Object.keys(env);
    diag.hasDB = !!env.DB;
    diag.hasAI = !!env.AI;
    diag.dbType = env.DB ? typeof env.DB : 'undefined';

    if (env.DB) {
      // Try a simple query to test D1
      try {
        const d1Raw = env.DB as { prepare: (sql: string) => { first: () => Promise<unknown> } };
        const result = await d1Raw.prepare('SELECT 1 as test').first();
        diag.d1QueryTest = result;
        diag.d1Working = true;
      } catch (queryErr) {
        diag.d1Working = false;
        diag.d1QueryError = queryErr instanceof Error ? queryErr.message : String(queryErr);
      }
    }
  } catch (err) {
    diag.cfContextAvailable = false;
    diag.cfContextError = err instanceof Error ? err.message : String(err);
  }

  return Response.json(diag);
}
