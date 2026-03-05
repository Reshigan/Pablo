// lib/agents/codeReview.ts
// Code review system: analyzes diffs, suggests improvements, checks security
// Devin pattern: always review before accepting — catch bugs early

import { callModel, type EnvConfig } from './modelRouter';
import { detectIssues } from './selfHealer';

export interface ReviewIssue {
  severity: 'critical' | 'high' | 'medium' | 'low' | 'info';
  category: 'security' | 'logic' | 'quality' | 'performance' | 'style' | 'completeness';
  file: string;
  line?: number;
  description: string;
  suggestion: string;
}

export interface ReviewResult {
  score: number; // 0-100
  issues: ReviewIssue[];
  summary: string;
  passesThreshold: boolean;
  tokensUsed: number;
}

export interface DiffChunk {
  file: string;
  oldContent: string;
  newContent: string;
  language: string;
}

// Severity weights for scoring
const SEVERITY_WEIGHTS: Record<string, number> = {
  critical: 20,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

const PASS_THRESHOLD = 70;

// ─── Static Review ───────────────────────────────────────────────────

/**
 * Run static analysis checks on code (no LLM needed)
 */
export function staticReview(
  files: Array<{ path: string; content: string; language: string }>,
): ReviewIssue[] {
  const allIssues: ReviewIssue[] = [];

  for (const file of files) {
    // Use self-healer's detection
    const healingIssues = detectIssues(file.content, file.language);
    for (const hi of healingIssues) {
      allIssues.push({
        severity: hi.severity === 'error' ? 'high' : 'medium',
        category: mapCategory(hi.type),
        file: file.path,
        line: hi.line,
        description: hi.message,
        suggestion: hi.autoFixable ? 'Auto-fixable' : 'Manual fix needed',
      });
    }

    // Additional static checks
    allIssues.push(...checkFileSpecific(file));
  }

  return allIssues;
}

function mapCategory(type: string): ReviewIssue['category'] {
  switch (type) {
    case 'security': return 'security';
    case 'logic': return 'logic';
    case 'lint': case 'style': return 'style';
    case 'type': case 'import': case 'syntax': return 'quality';
    default: return 'quality';
  }
}

function checkFileSpecific(file: { path: string; content: string; language: string }): ReviewIssue[] {
  const issues: ReviewIssue[] = [];

  // Python-specific
  if (file.language === 'python') {
    // Missing error handling on DB operations
    if (file.content.includes('.commit()') && !file.content.includes('try')) {
      issues.push({
        severity: 'medium',
        category: 'quality',
        file: file.path,
        description: 'Database commit without try/except block',
        suggestion: 'Wrap database operations in try/except with rollback on failure',
      });
    }

    // Missing type hints
    const defCount = (file.content.match(/def \w+\(/g) || []).length;
    const typedCount = (file.content.match(/def \w+\([^)]*:.*\)\s*->/g) || []).length;
    if (defCount > 0 && typedCount < defCount * 0.5) {
      issues.push({
        severity: 'low',
        category: 'quality',
        file: file.path,
        description: `Only ${typedCount}/${defCount} functions have type annotations`,
        suggestion: 'Add type hints to all function parameters and return types',
      });
    }

  }

  // TypeScript/JavaScript-specific
  if (file.language === 'typescript' || file.language === 'javascript') {
    // Missing error boundary in React components
    if (file.content.includes('React') && file.content.includes('fetch(') && !file.content.includes('catch')) {
      issues.push({
        severity: 'medium',
        category: 'quality',
        file: file.path,
        description: 'Fetch call without error handling',
        suggestion: 'Add .catch() or wrap in try/catch for proper error handling',
      });
    }

    // Async function without await
    const asyncFunctions = file.content.match(/async\s+function\s+\w+|async\s+\([^)]*\)\s*=>/g) || [];
    if (asyncFunctions.length > 0 && !file.content.includes('await')) {
      issues.push({
        severity: 'low',
        category: 'quality',
        file: file.path,
        description: 'Async function(s) declared but no await keyword found',
        suggestion: 'Remove async keyword or add await for asynchronous operations',
      });
    }
  }

  // Universal: file size check
  const lines = file.content.split('\n').length;
  if (lines > 500) {
    issues.push({
      severity: 'low',
      category: 'quality',
      file: file.path,
      description: `File has ${lines} lines — consider splitting into smaller modules`,
      suggestion: 'Extract related logic into separate files/modules',
    });
  }

  return issues;
}

// ─── LLM-Powered Review ─────────────────────────────────────────────

const REVIEW_PROMPT = `You are a senior code reviewer. Review the provided code thoroughly.

CHECK FOR:
1. Security vulnerabilities (SQL injection, XSS, hardcoded secrets, missing auth)
2. Logic bugs (off-by-one, null references, race conditions)
3. Missing error handling
4. Performance issues (N+1 queries, unnecessary re-renders, memory leaks)
5. Code quality (naming, structure, DRY violations)
6. Completeness (TODO/FIXME, placeholder implementations)

OUTPUT FORMAT (JSON array):
[
  {
    "severity": "critical|high|medium|low|info",
    "category": "security|logic|quality|performance|style|completeness",
    "file": "filename",
    "description": "what's wrong",
    "suggestion": "how to fix it"
  }
]

If no issues found, return: []
Output ONLY valid JSON.`;

/**
 * Perform a full code review (static + LLM)
 */
export async function reviewCode(
  files: Array<{ path: string; content: string; language: string }>,
  originalRequest: string,
  env: EnvConfig,
): Promise<ReviewResult> {
  // Phase 1: Static analysis
  const staticIssues = staticReview(files);

  // Phase 2: LLM review
  const codeSnippet = files
    .map((f) => `### ${f.path} (${f.language})\n\`\`\`${f.language}\n${f.content.slice(0, 3000)}\n\`\`\``)
    .join('\n\n');

  let llmIssues: ReviewIssue[] = [];
  let tokensUsed = 0;

  try {
    const MODEL = {
      provider: 'ollama_cloud' as const,
      model: 'qwen3:32b',
      description: 'Code reviewer',
      max_tokens: 8192,
      temperature: 0.2,
      estimated_speed: '40-80 TPS',
    };

    const result = await callModel(
      {
        model: MODEL,
        systemPrompt: REVIEW_PROMPT,
        userMessage: `ORIGINAL REQUEST: ${originalRequest}\n\nCODE TO REVIEW:\n${codeSnippet.slice(0, 12000)}`,
      },
      env,
    );

    tokensUsed = result.tokens_used;

    const jsonMatch = result.content.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{
        severity?: string;
        category?: string;
        file?: string;
        description?: string;
        suggestion?: string;
      }>;
      llmIssues = parsed.map((p) => ({
        severity: (p.severity as ReviewIssue['severity']) || 'medium',
        category: (p.category as ReviewIssue['category']) || 'quality',
        file: p.file || files[0]?.path || 'unknown',
        description: p.description || '',
        suggestion: p.suggestion || '',
      }));
    }
  } catch {
    // LLM review failed — continue with static issues only
  }

  // Combine and deduplicate
  const allIssues = deduplicateIssues([...staticIssues, ...llmIssues]);

  // Calculate score
  const penalty = allIssues.reduce((sum, issue) => sum + (SEVERITY_WEIGHTS[issue.severity] || 0), 0);
  const score = Math.max(0, 100 - penalty);

  // Build summary
  const severityCounts: Record<string, number> = {};
  for (const issue of allIssues) {
    severityCounts[issue.severity] = (severityCounts[issue.severity] || 0) + 1;
  }
  const summaryParts = Object.entries(severityCounts)
    .sort((a, b) => (SEVERITY_WEIGHTS[b[0]] || 0) - (SEVERITY_WEIGHTS[a[0]] || 0))
    .map(([sev, count]) => `${count} ${sev}`);

  const summary = allIssues.length === 0
    ? 'No issues found — code passes review'
    : `Found ${allIssues.length} issues (${summaryParts.join(', ')}). Score: ${score}/100`;

  return {
    score,
    issues: allIssues,
    summary,
    passesThreshold: score >= PASS_THRESHOLD,
    tokensUsed,
  };
}

/**
 * Quick review — static analysis only (no LLM call)
 */
export function quickReview(
  files: Array<{ path: string; content: string; language: string }>,
): ReviewResult {
  const issues = staticReview(files);
  const penalty = issues.reduce((sum, issue) => sum + (SEVERITY_WEIGHTS[issue.severity] || 0), 0);
  const score = Math.max(0, 100 - penalty);

  return {
    score,
    issues,
    summary: issues.length === 0
      ? 'No issues found'
      : `Found ${issues.length} issues. Score: ${score}/100`,
    passesThreshold: score >= PASS_THRESHOLD,
    tokensUsed: 0,
  };
}

/**
 * Review a diff (old vs new content)
 */
export async function reviewDiff(
  diffs: DiffChunk[],
  env: EnvConfig,
): Promise<ReviewResult> {
  const files = diffs.map((d) => ({
    path: d.file,
    content: d.newContent,
    language: d.language,
  }));
  return reviewCode(files, 'Review code changes', env);
}

// ─── Helpers ─────────────────────────────────────────────────────────

function deduplicateIssues(issues: ReviewIssue[]): ReviewIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.file}:${issue.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Format review results for display
 */
export function formatReviewForDisplay(result: ReviewResult): string {
  const lines: string[] = [];
  lines.push(`## Code Review — Score: ${result.score}/100 ${result.passesThreshold ? '(PASS)' : '(NEEDS FIXES)'}\n`);

  if (result.issues.length === 0) {
    lines.push('No issues found. Code looks good!\n');
    return lines.join('\n');
  }

  // Group by severity
  const grouped: Record<string, ReviewIssue[]> = {};
  for (const issue of result.issues) {
    if (!grouped[issue.severity]) grouped[issue.severity] = [];
    grouped[issue.severity].push(issue);
  }

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  const severityEmoji: Record<string, string> = {
    critical: '[CRITICAL]',
    high: '[HIGH]',
    medium: '[MEDIUM]',
    low: '[LOW]',
    info: '[INFO]',
  };

  for (const sev of severityOrder) {
    const issues = grouped[sev];
    if (!issues || issues.length === 0) continue;

    lines.push(`### ${severityEmoji[sev]} ${sev.toUpperCase()} (${issues.length})\n`);
    for (const issue of issues) {
      lines.push(`- **${issue.file}**: ${issue.description}`);
      if (issue.suggestion) lines.push(`  *Fix:* ${issue.suggestion}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}
