// lib/agents/memorySystem.ts
// Memory & Learning system: captures patterns from accepted code, persists knowledge
// Devin pattern: learn from every interaction, get better over time

export interface LearnedPattern {
  id: string;
  trigger: string;      // What the user asked for
  action: string;       // What code/approach worked
  confidence: number;   // 0-1, increases with successful reuse
  domain: string;       // e.g. 'auth', 'api', 'ui', 'database'
  language: string;     // e.g. 'typescript', 'python'
  createdAt: number;
  lastUsedAt: number;
  useCount: number;
}

export interface KnowledgeEntry {
  id: string;
  category: 'best_practice' | 'anti_pattern' | 'convention' | 'architecture' | 'security' | 'performance';
  title: string;
  description: string;
  example?: string;
  source: string;       // Where this was learned from
  confidence: number;
  createdAt: number;
}

export interface MemorySnapshot {
  patterns: LearnedPattern[];
  knowledge: KnowledgeEntry[];
  totalInteractions: number;
  topDomains: Array<{ domain: string; count: number }>;
}

// ─── Pattern Extraction ──────────────────────────────────────────────

/**
 * Extract patterns from a user request + accepted code pair
 */
export function extractPatterns(
  userMessage: string,
  generatedCode: string,
  language: string,
): LearnedPattern[] {
  const patterns: LearnedPattern[] = [];
  const msgLower = userMessage.toLowerCase();
  const now = Date.now();

  // Detect domain from keywords
  const domain = detectDomain(userMessage, generatedCode);

  // Extract code patterns
  const codePatterns = extractCodePatterns(generatedCode, language);
  for (const cp of codePatterns) {
    patterns.push({
      id: `pat-${now}-${Math.random().toString(36).slice(2, 8)}`,
      trigger: cp.trigger,
      action: cp.action,
      confidence: 0.7,
      domain,
      language,
      createdAt: now,
      lastUsedAt: now,
      useCount: 1,
    });
  }

  // Extract request patterns (what user asked for → what approach was used)
  if (/auth|login|register/.test(msgLower)) {
    if (generatedCode.includes('jwt') || generatedCode.includes('JWT')) {
      patterns.push(makePattern('User asks for auth', 'Use JWT-based authentication', domain, language, now));
    }
    if (generatedCode.includes('bcrypt') || generatedCode.includes('hashpw')) {
      patterns.push(makePattern('User asks for auth', 'Hash passwords with bcrypt', domain, language, now));
    }
  }

  if (/crud|endpoint|api/.test(msgLower)) {
    if (generatedCode.includes('pagination') || generatedCode.includes('skip') || generatedCode.includes('limit')) {
      patterns.push(makePattern('User asks for CRUD API', 'Include pagination (skip/limit)', domain, language, now));
    }
    if (generatedCode.includes('soft_delete') || generatedCode.includes('is_active')) {
      patterns.push(makePattern('User asks for CRUD API', 'Use soft delete (is_active flag)', domain, language, now));
    }
  }

  if (/dashboard|chart|metric/.test(msgLower)) {
    patterns.push(makePattern('User asks for dashboard', 'Include summary cards + charts + data table', domain, language, now));
  }

  return patterns;
}

function makePattern(trigger: string, action: string, domain: string, language: string, now: number): LearnedPattern {
  return {
    id: `pat-${now}-${Math.random().toString(36).slice(2, 8)}`,
    trigger,
    action,
    confidence: 0.7,
    domain,
    language,
    createdAt: now,
    lastUsedAt: now,
    useCount: 1,
  };
}

/**
 * Extract reusable code patterns from generated code
 */
function extractCodePatterns(code: string, language: string): Array<{ trigger: string; action: string }> {
  const patterns: Array<{ trigger: string; action: string }> = [];

  if (language === 'python') {
    if (code.includes('BaseModel')) patterns.push({ trigger: 'Python data model', action: 'Use Pydantic BaseModel for validation' });
    if (code.includes('Depends(')) patterns.push({ trigger: 'FastAPI dependency', action: 'Use Depends() for dependency injection' });
    if (code.includes('HTTPException')) patterns.push({ trigger: 'API error handling', action: 'Raise HTTPException with proper status codes' });
    if (code.includes('CORSMiddleware')) patterns.push({ trigger: 'CORS setup', action: 'Add CORSMiddleware with specific origins' });
    if (code.includes('async def')) patterns.push({ trigger: 'Async endpoint', action: 'Use async def for I/O-bound operations' });
  }

  if (language === 'typescript' || language === 'javascript') {
    if (code.includes('zod')) patterns.push({ trigger: 'TS validation', action: 'Use zod for runtime validation' });
    if (code.includes('prisma')) patterns.push({ trigger: 'TS database', action: 'Use Prisma ORM for database access' });
    if (code.includes('useEffect')) patterns.push({ trigger: 'React side effect', action: 'Use useEffect with proper cleanup' });
    if (code.includes('tRPC') || code.includes('trpc')) patterns.push({ trigger: 'Type-safe API', action: 'Use tRPC for type-safe API layer' });
    if (code.includes('middleware')) patterns.push({ trigger: 'Request middleware', action: 'Use middleware for cross-cutting concerns' });
  }

  return patterns;
}

/**
 * Detect the domain/category of a request
 */
function detectDomain(userMessage: string, code: string): string {
  const msg = (userMessage + ' ' + code).toLowerCase();
  if (/auth|login|register|jwt|oauth|session/.test(msg)) return 'auth';
  if (/database|model|schema|migration|table|query/.test(msg)) return 'database';
  if (/api|endpoint|route|rest|graphql/.test(msg)) return 'api';
  if (/ui|component|page|dashboard|form|button/.test(msg)) return 'ui';
  if (/test|spec|assert|mock|fixture/.test(msg)) return 'testing';
  if (/deploy|ci|cd|docker|kubernetes/.test(msg)) return 'devops';
  if (/security|encrypt|hash|cors|csrf/.test(msg)) return 'security';
  if (/performance|cache|optimize|index/.test(msg)) return 'performance';
  return 'general';
}

// ─── Knowledge Extraction ────────────────────────────────────────────

/**
 * Extract knowledge entries from code review feedback
 */
export function extractKnowledge(
  reviewFeedback: string,
  category: KnowledgeEntry['category'] = 'best_practice',
): KnowledgeEntry[] {
  const entries: KnowledgeEntry[] = [];
  const now = Date.now();

  // Split feedback into individual points
  const points = reviewFeedback.split(/\n[-*]\s+/).filter((p) => p.trim().length > 10);

  for (const point of points) {
    const title = point.split(/[.!?\n]/)[0].trim();
    if (title.length > 5 && title.length < 200) {
      entries.push({
        id: `kb-${now}-${Math.random().toString(36).slice(2, 8)}`,
        category,
        title,
        description: point.trim(),
        source: 'code_review',
        confidence: 0.6,
        createdAt: now,
      });
    }
  }

  return entries;
}

// ─── Unified Pattern Store (in-memory + direct DB persistence) ───

// Local cache to avoid hitting the DB on every call
let patternCache: LearnedPattern[] = [];
let cacheLoadedAt = 0;
const CACHE_TTL_MS = 30_000; // 30s

/**
 * Save learned patterns to in-memory cache and persist to D1 via direct DB call.
 * Uses D1 directly instead of fetch('/api/patterns') to avoid relative URL
 * issues when called from server-side route handlers.
 */
export async function savePatterns(patterns: LearnedPattern[]): Promise<void> {
  for (const pattern of patterns) {
    // Check local cache first
    const existing = patternCache.find(
      (p) => p.trigger === pattern.trigger && p.action === pattern.action,
    );

    if (existing) {
      existing.confidence = Math.min(existing.confidence + 0.1, 1);
      existing.lastUsedAt = Date.now();
      existing.useCount += 1;
    } else {
      patternCache.push(pattern);
    }

    // Persist to D1 directly (works server-side without URL issues)
    try {
      const { d1CreatePattern, d1UpdatePattern } = await import('@/lib/db/d1-patterns');
      if (existing) {
        await d1UpdatePattern(existing.id, {
          confidence: existing.confidence,
          usageCount: existing.useCount,
          lastUsedAt: new Date(existing.lastUsedAt).toISOString(),
        });
      } else {
        await d1CreatePattern({
          id: pattern.id,
          type: 'code_pattern',
          trigger: pattern.trigger,
          action: pattern.action,
          confidence: pattern.confidence,
          metadata: JSON.stringify({ domain: pattern.domain, language: pattern.language }),
        });
      }
    } catch {
      // Non-blocking — pattern stays in local cache
    }
  }
}

/**
 * Synchronous save for use in stores (fire-and-forget)
 */
export function savePatternsSync(patterns: LearnedPattern[]): void {
  void savePatterns(patterns);
}

/**
 * Get all learned patterns, optionally filtered by domain.
 * Tries /api/patterns first, falls back to local cache.
 */
export function getLearnedPatterns(domain?: string): LearnedPattern[] {
  const all = patternCache;
  if (domain) {
    return all.filter((p) => p.domain === domain);
  }
  return all;
}

/**
 * Load patterns from the DB into the local cache (call on app init).
 * Uses D1 directly instead of fetch('/api/patterns') to avoid
 * relative URL issues when called from server-side route handlers.
 */
export async function loadPatternsFromAPI(): Promise<void> {
  if (Date.now() - cacheLoadedAt < CACHE_TTL_MS) return;
  try {
    const { d1GetPatterns } = await import('@/lib/db/d1-patterns');
    const data = await d1GetPatterns() as Array<{
      id: string;
      trigger: string;
      action: string;
      confidence: number;
      usageCount: number;
      metadata?: string | null;
      createdAt: string;
      lastUsedAt?: string | null;
    }>;
    if (data && data.length > 0) {
      patternCache = data.map((p) => {
        const meta = p.metadata ? (JSON.parse(p.metadata) as { domain?: string; language?: string }) : {};
        return {
          id: p.id,
          trigger: p.trigger,
          action: p.action,
          confidence: p.confidence,
          domain: meta.domain || 'general',
          language: meta.language || 'typescript',
          createdAt: new Date(p.createdAt).getTime(),
          lastUsedAt: p.lastUsedAt ? new Date(p.lastUsedAt).getTime() : Date.now(),
          useCount: p.usageCount,
        };
      });
    }
    cacheLoadedAt = Date.now();
  } catch {
    // Non-blocking — use existing cache
  }
}

/**
 * Get patterns most relevant to a given request
 */
export function getRelevantPatterns(
  userMessage: string,
  maxPatterns: number = 10,
): LearnedPattern[] {
  const allPatterns = getLearnedPatterns();
  if (allPatterns.length === 0) return [];

  const msgLower = userMessage.toLowerCase();
  const msgTerms = msgLower.split(/\s+/).filter((t) => t.length > 2);

  // Score each pattern by relevance
  const scored = allPatterns.map((p) => {
    let score = p.confidence * 0.3;
    score += Math.min(p.useCount * 0.05, 0.2);

    const triggerLower = p.trigger.toLowerCase();
    const actionLower = p.action.toLowerCase();
    for (const term of msgTerms) {
      if (triggerLower.includes(term)) score += 0.2;
      if (actionLower.includes(term)) score += 0.1;
    }

    const domain = detectDomain(userMessage, '');
    if (p.domain === domain) score += 0.15;

    return { pattern: p, score };
  });

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxPatterns)
    .map((s) => s.pattern);
}

/**
 * Get a snapshot of the memory system's current state
 */
export function getMemorySnapshot(): MemorySnapshot {
  const patterns = getLearnedPatterns();

  const domainCounts: Record<string, number> = {};
  for (const p of patterns) {
    domainCounts[p.domain] = (domainCounts[p.domain] || 0) + 1;
  }
  const topDomains = Object.entries(domainCounts)
    .map(([domain, count]) => ({ domain, count }))
    .sort((a, b) => b.count - a.count);

  return {
    patterns,
    knowledge: [],
    totalInteractions: patterns.reduce((sum, p) => sum + p.useCount, 0),
    topDomains,
  };
}

/**
 * Format patterns for injection into LLM prompt
 */
export function formatPatternsForPrompt(patterns: LearnedPattern[]): string {
  if (patterns.length === 0) return '';

  const lines = patterns.map(
    (p) => `- When: "${p.trigger}" → Do: "${p.action}" (confidence: ${(p.confidence * 100).toFixed(0)}%, used ${p.useCount}x)`,
  );

  return `## Learned Patterns (from previous successful interactions)\n${lines.join('\n')}`;
}
