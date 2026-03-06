/**
 * D1-backed Business Rules Engine — CRUD operations for user-defined and
 * system rules that govern code generation behaviour.
 *
 * Phase 1 of the Enterprise AI Division spec: BusinessRulesEngine
 * - D1 table `business_rules` stores rules with category, severity, pattern, action
 * - Rules are injected into pipeline stage prompts so the LLM respects them
 * - Falls back gracefully if D1 is unavailable (local dev)
 */

export type RuleSeverity = 'error' | 'warning' | 'info';
export type RuleCategory =
  | 'naming'
  | 'security'
  | 'architecture'
  | 'database'
  | 'api'
  | 'testing'
  | 'compliance'
  | 'performance'
  | 'accessibility'
  | 'custom';

export interface BusinessRule {
  id: string;
  title: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  /** Regex or glob pattern that identifies files/code this rule applies to */
  pattern: string;
  /** What the pipeline should do when this rule matches */
  action: string;
  /** Whether this rule is currently active */
  enabled: boolean;
  /** Whether this is a built-in (non-deletable) rule */
  builtIn: boolean;
  createdAt: string;
  updatedAt: string;
}

// ─── Built-in rules (Phase 1: StandardsEnforcer integration) ────────────────

export const BUILT_IN_RULES: Omit<BusinessRule, 'id' | 'createdAt' | 'updatedAt'>[] = [
  {
    title: 'No hardcoded secrets',
    description: 'API keys, passwords, and tokens must never appear as string literals in source code. Use environment variables.',
    category: 'security',
    severity: 'error',
    pattern: '\\.(ts|tsx|js|jsx|py|go|rs)$',
    action: 'Replace hardcoded value with process.env.VARIABLE_NAME or equivalent env lookup. Add the variable to .env.example.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'Integer cents for money',
    description: 'Financial amounts must be stored and computed as integer cents (or smallest currency unit), never as floating-point.',
    category: 'database',
    severity: 'error',
    pattern: '\\.(ts|tsx|js|jsx|sql)$',
    action: 'Change column type to INTEGER and store values in cents. Convert to display currency only at the UI layer.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'Health endpoint required',
    description: 'Every backend service must expose a /health endpoint that returns HTTP 200 with dependency status.',
    category: 'architecture',
    severity: 'error',
    pattern: '(route|server|app|index)\\.(ts|js|py|go)$',
    action: 'Add a GET /health route that checks DB connectivity and returns { status: "ok", dependencies: {...} }.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'Structured logging only',
    description: 'Use structured JSON logging (e.g. pino, winston, structlog) instead of raw console.log in production code.',
    category: 'architecture',
    severity: 'warning',
    pattern: '\\.(ts|tsx|js|jsx)$',
    action: 'Replace console.log/warn/error with a structured logger that outputs JSON with timestamp, level, requestId, and message.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'API versioning prefix',
    description: 'All API routes must be prefixed with /api/v1/ to enable non-breaking evolution.',
    category: 'api',
    severity: 'warning',
    pattern: '(route|router|app)\\.(ts|js|py|go)$',
    action: 'Prefix all API routes with /api/v1/. Never remove or rename an existing versioned endpoint — add /api/v2/ instead.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'Tests for every endpoint',
    description: 'Every API endpoint must have at least one happy-path test and one error-case test.',
    category: 'testing',
    severity: 'warning',
    pattern: '\\.(test|spec)\\.(ts|tsx|js|jsx|py)$',
    action: 'Create test files that cover: 200 success, 400 bad input, 401 unauthorized, and 404 not found for each endpoint.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'POPIA consent tracking',
    description: 'If handling South African personal data, consent must be explicitly tracked with timestamp and purpose.',
    category: 'compliance',
    severity: 'error',
    pattern: '\\.(ts|tsx|js|jsx|sql)$',
    action: 'Add consent_given (boolean), consent_timestamp (datetime), consent_purpose (text) columns to any table storing personal data.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'Request ID on all responses',
    description: 'Every HTTP response must include an X-Request-ID header with a unique UUID for traceability.',
    category: 'architecture',
    severity: 'warning',
    pattern: '(middleware|route|server)\\.(ts|js|py|go)$',
    action: 'Add middleware that generates crypto.randomUUID() per request and sets it as X-Request-ID response header.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'Additive migrations only',
    description: 'Database migrations must be additive (add columns/tables). Never drop or rename columns in a single migration.',
    category: 'database',
    severity: 'error',
    pattern: '(migration|schema)\\.(ts|js|sql)$',
    action: 'Use a two-phase approach: Phase 1 — add new column + stop writing to old. Phase 2 — drop old column in a separate migration.',
    enabled: true,
    builtIn: true,
  },
  {
    title: 'No floating-point equality',
    description: 'Never compare floating-point numbers with === or ==. Use Math.abs(a - b) < epsilon instead.',
    category: 'performance',
    severity: 'warning',
    pattern: '\\.(ts|tsx|js|jsx)$',
    action: 'Replace direct equality check with an epsilon comparison: Math.abs(a - b) < Number.EPSILON or a tolerance value.',
    enabled: true,
    builtIn: true,
  },
];

// ─── D1 CRUD ────────────────────────────────────────────────────────────────

async function getDBAsync(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    return (ctx.env as Record<string, unknown>).DB as D1Database || null;
  } catch {
    return null;
  }
}

function generateRuleId(): string {
  return `rule_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * List all business rules, optionally filtered by category.
 * Merges built-in rules with user-defined D1 rules.
 */
export async function listBusinessRules(category?: RuleCategory): Promise<BusinessRule[]> {
  const now = new Date().toISOString();
  const builtInRules: BusinessRule[] = BUILT_IN_RULES.map((r, i) => ({
    ...r,
    id: `builtin_${i}`,
    createdAt: now,
    updatedAt: now,
  }));

  const db = await getDBAsync();
  let userRules: BusinessRule[] = [];
  if (db) {
    try {
      const query = category
        ? db.prepare('SELECT * FROM business_rules WHERE category = ? ORDER BY created_at DESC').bind(category)
        : db.prepare('SELECT * FROM business_rules ORDER BY created_at DESC');
      const result = await query.all<{
        id: string;
        title: string;
        description: string;
        category: string;
        severity: string;
        pattern: string;
        action: string;
        enabled: number;
        built_in: number;
        created_at: string;
        updated_at: string;
      }>();
      userRules = (result.results || []).map((r) => ({
        id: r.id,
        title: r.title,
        description: r.description,
        category: r.category as RuleCategory,
        severity: r.severity as RuleSeverity,
        pattern: r.pattern,
        action: r.action,
        enabled: r.enabled === 1,
        builtIn: r.built_in === 1,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      }));
    } catch {
      // Table may not exist yet — return built-ins only
    }
  }

  const all = [...builtInRules, ...userRules];
  return category ? all.filter((r) => r.category === category) : all;
}

/**
 * Get only enabled rules, formatted as a prompt block for the pipeline.
 */
export async function getActiveRulesPrompt(): Promise<string> {
  const rules = await listBusinessRules();
  const enabled = rules.filter((r) => r.enabled);
  if (enabled.length === 0) return '';

  const lines = enabled.map(
    (r) => `- [${r.severity.toUpperCase()}] ${r.title}: ${r.description}\n  Action: ${r.action}`
  );
  return `\n## Business Rules (MANDATORY — enforce all of these)\n${lines.join('\n')}\n`;
}

/**
 * Create a new user-defined business rule.
 */
export async function createBusinessRule(data: {
  title: string;
  description: string;
  category: RuleCategory;
  severity: RuleSeverity;
  pattern: string;
  action: string;
}): Promise<BusinessRule> {
  const id = generateRuleId();
  const now = new Date().toISOString();
  const rule: BusinessRule = {
    id,
    title: data.title,
    description: data.description,
    category: data.category,
    severity: data.severity,
    pattern: data.pattern,
    action: data.action,
    enabled: true,
    builtIn: false,
    createdAt: now,
    updatedAt: now,
  };

  const db = await getDBAsync();
  if (db) {
    await db.prepare(
      `INSERT INTO business_rules (id, title, description, category, severity, pattern, action, enabled, built_in, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 0, ?, ?)`
    ).bind(id, data.title, data.description, data.category, data.severity, data.pattern, data.action, now, now).run();
  }

  return rule;
}

/**
 * Update an existing user-defined rule.
 */
export async function updateBusinessRule(
  id: string,
  updates: Partial<Pick<BusinessRule, 'title' | 'description' | 'category' | 'severity' | 'pattern' | 'action' | 'enabled'>>
): Promise<BusinessRule | null> {
  const db = await getDBAsync();
  if (!db) return null;

  const sets: string[] = [];
  const values: unknown[] = [];
  if (updates.title !== undefined) { sets.push('title = ?'); values.push(updates.title); }
  if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
  if (updates.category !== undefined) { sets.push('category = ?'); values.push(updates.category); }
  if (updates.severity !== undefined) { sets.push('severity = ?'); values.push(updates.severity); }
  if (updates.pattern !== undefined) { sets.push('pattern = ?'); values.push(updates.pattern); }
  if (updates.action !== undefined) { sets.push('action = ?'); values.push(updates.action); }
  if (updates.enabled !== undefined) { sets.push('enabled = ?'); values.push(updates.enabled ? 1 : 0); }

  if (sets.length === 0) return null;
  sets.push("updated_at = datetime('now')");
  values.push(id);

  await db.prepare(`UPDATE business_rules SET ${sets.join(', ')} WHERE id = ? AND built_in = 0`).bind(...values).run();

  const row = await db.prepare('SELECT * FROM business_rules WHERE id = ?').bind(id).first<{
    id: string; title: string; description: string; category: string; severity: string;
    pattern: string; action: string; enabled: number; built_in: number; created_at: string; updated_at: string;
  }>();
  if (!row) return null;
  return {
    id: row.id, title: row.title, description: row.description,
    category: row.category as RuleCategory, severity: row.severity as RuleSeverity,
    pattern: row.pattern, action: row.action,
    enabled: row.enabled === 1, builtIn: row.built_in === 1,
    createdAt: row.created_at, updatedAt: row.updated_at,
  };
}

/**
 * Delete a user-defined rule (built-in rules cannot be deleted).
 */
export async function deleteBusinessRule(id: string): Promise<boolean> {
  const db = await getDBAsync();
  if (!db) return false;
  const result = await db.prepare('DELETE FROM business_rules WHERE id = ? AND built_in = 0').bind(id).run();
  return (result.meta?.changes ?? 0) > 0;
}
