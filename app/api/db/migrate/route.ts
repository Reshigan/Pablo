import { auth } from '@/lib/auth';
import { execD1SQL } from '@/lib/db/drizzle';

const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT 'Untitled Session',
  repo_url TEXT,
  repo_branch TEXT DEFAULT 'main',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','completed','error')),
  metadata TEXT
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL,
  model TEXT,
  tokens INTEGER,
  duration_ms INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS files (
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
);

CREATE TABLE IF NOT EXISTS pipeline_runs (
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
);

CREATE TABLE IF NOT EXISTS pipeline_stages (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES pipeline_runs(id) ON DELETE CASCADE,
  stage TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  input TEXT, output TEXT, model TEXT,
  tokens INTEGER DEFAULT 0, duration_ms INTEGER DEFAULT 0,
  error TEXT, started_at TEXT, completed_at TEXT
);

CREATE TABLE IF NOT EXISTS patterns (
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
);

CREATE TABLE IF NOT EXISTS domain_kb (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT, source TEXT,
  confidence REAL NOT NULL DEFAULT 0.8,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

// Separate ALTER TABLE statements (these can fail if column already exists, that's OK)
const MIGRATION_V2_SQL = `ALTER TABLE sessions ADD COLUMN snapshot TEXT;`;

/**
 * POST /api/db/migrate — Run D1 schema migration
 */
export async function POST() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const success = await execD1SQL(MIGRATION_SQL);
    if (success) {
      // Run v2 migration (add snapshot column) — OK if it fails (column may already exist)
      try { await execD1SQL(MIGRATION_V2_SQL); } catch { /* column already exists */ }
      return Response.json({ status: 'ok', message: 'D1 migration applied successfully (including v2 snapshot column)' });
    }
    return Response.json({ status: 'skipped', message: 'D1 not available (local dev mode)' });
  } catch (error) {
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ status: 'error', message: msg }, { status: 500 });
  }
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
