// lib/agents/productionReadiness.ts
// Production Readiness Score — evaluates pipeline output for deploy-worthiness.
// Runs static pattern checks + optional LLM deep review.
// Returns a per-bug breakdown and aggregate score per build.

import { callModel, type EnvConfig } from './modelRouter';

// ─── Types ──────────────────────────────────────────────────────────

export type ReadinessCategory =
  | 'security'
  | 'error-handling'
  | 'performance'
  | 'accessibility'
  | 'code-quality'
  | 'completeness'
  | 'testing';

export type ReadinessSeverity = 'critical' | 'major' | 'minor' | 'suggestion';

export interface ReadinessIssue {
  id: string;
  severity: ReadinessSeverity;
  category: ReadinessCategory;
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestion: string;
}

export interface ReadinessScore {
  /** Aggregate score 0-100 */
  score: number;
  /** Letter grade A-F */
  grade: string;
  /** Per-category breakdown (0-100 each) */
  categories: Record<ReadinessCategory, { score: number; issues: number }>;
  /** All issues found */
  issues: ReadinessIssue[];
  /** Improvement suggestions for next iteration */
  iterationPrompt: string;
  /** Timestamp */
  evaluatedAt: number;
  /** Tokens used for LLM evaluation (0 if static-only) */
  tokensUsed: number;
}

// ─── Severity weights ───────────────────────────────────────────────

const SEVERITY_PENALTY: Record<ReadinessSeverity, number> = {
  critical: 15,
  major: 8,
  minor: 3,
  suggestion: 1,
};

const CATEGORY_WEIGHT: Record<ReadinessCategory, number> = {
  'security': 1.5,
  'error-handling': 1.3,
  'performance': 1.0,
  'accessibility': 0.8,
  'code-quality': 1.0,
  'completeness': 1.2,
  'testing': 1.0,
};

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// ─── Static Analysis Checks ─────────────────────────────────────────

let issueCounter = 0;
function nextId(): string {
  issueCounter += 1;
  return `prs-${Date.now()}-${issueCounter}`;
}

function staticChecks(
  files: Array<{ path: string; content: string; language: string }>,
): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];

  for (const file of files) {
    const lines = file.content.split('\n');

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;

      // ── Security ──────────────────────────────────────────────
      if (/(?:password|secret|api[_-]?key|token)\s*[:=]\s*['"][^'"]{8,}['"]/i.test(line)) {
        issues.push({
          id: nextId(), severity: 'critical', category: 'security',
          file: file.path, line: lineNum,
          title: 'Hardcoded secret',
          description: 'Potential hardcoded credential or API key found in source code.',
          suggestion: 'Move to environment variables or a secrets manager.',
        });
      }

      if (/dangerouslySetInnerHTML/i.test(line)) {
        issues.push({
          id: nextId(), severity: 'major', category: 'security',
          file: file.path, line: lineNum,
          title: 'XSS risk: dangerouslySetInnerHTML',
          description: 'Using dangerouslySetInnerHTML without sanitization exposes the app to XSS attacks.',
          suggestion: 'Sanitize HTML with DOMPurify or use safe rendering alternatives.',
        });
      }

      if (/\beval\s*\(/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          id: nextId(), severity: 'critical', category: 'security',
          file: file.path, line: lineNum,
          title: 'eval() usage',
          description: 'eval() executes arbitrary code and is a major security risk.',
          suggestion: 'Replace eval() with JSON.parse(), Function constructor, or refactor logic.',
        });
      }

      // ── Error Handling ────────────────────────────────────────
      if (/catch\s*\([^)]*\)\s*\{\s*\}/.test(line)) {
        issues.push({
          id: nextId(), severity: 'major', category: 'error-handling',
          file: file.path, line: lineNum,
          title: 'Empty catch block',
          description: 'Errors are silently swallowed — user gets no feedback on failures.',
          suggestion: 'Log the error, show a user-facing message, or re-throw.',
        });
      }

      if (/\.catch\(\s*\(\)\s*=>\s*\{\s*\}\s*\)/.test(line)) {
        issues.push({
          id: nextId(), severity: 'major', category: 'error-handling',
          file: file.path, line: lineNum,
          title: 'Empty .catch() handler',
          description: 'Promise errors are silently ignored.',
          suggestion: 'Handle the error or at least log it for debugging.',
        });
      }

      // fetch without error handling
      if (/\bfetch\s*\(/.test(line)) {
        // Only flag if it's clearly not in a try/catch (rough heuristic)
        const surroundingContext = lines.slice(Math.max(0, i - 3), i + 5).join('\n');
        if (!surroundingContext.includes('try') && !surroundingContext.includes('catch') && !surroundingContext.includes('.catch')) {
          issues.push({
            id: nextId(), severity: 'minor', category: 'error-handling',
            file: file.path, line: lineNum,
            title: 'Unguarded fetch() call',
            description: 'Network request without visible error handling.',
            suggestion: 'Wrap in try/catch or add .catch() to handle network failures gracefully.',
          });
        }
      }

      // ── Performance ───────────────────────────────────────────
      if (/console\.(log|debug|info|warn)\b/.test(line) && !file.path.includes('test')) {
        issues.push({
          id: nextId(), severity: 'minor', category: 'performance',
          file: file.path, line: lineNum,
          title: 'Console statement in production code',
          description: 'console.log statements impact performance and leak info in production.',
          suggestion: 'Remove or replace with a structured logger.',
        });
      }

      // ── Accessibility ─────────────────────────────────────────
      if (/<img\b/.test(line) && !/alt\s*=/.test(line)) {
        issues.push({
          id: nextId(), severity: 'minor', category: 'accessibility',
          file: file.path, line: lineNum,
          title: 'Image missing alt text',
          description: 'Screen readers cannot describe images without alt attributes.',
          suggestion: 'Add a descriptive alt attribute to all <img> tags.',
        });
      }

      if (/onClick\s*=/.test(line) && /<(?:div|span)\b/.test(line) && !/role\s*=/.test(line) && !/button/.test(line)) {
        issues.push({
          id: nextId(), severity: 'minor', category: 'accessibility',
          file: file.path, line: lineNum,
          title: 'Non-semantic click handler',
          description: 'Click handler on a non-interactive element (div/span) without role attribute.',
          suggestion: 'Use a <button> element or add role="button" and tabIndex={0}.',
        });
      }

      // ── Code Quality ──────────────────────────────────────────
      if ((file.language === 'typescript' || file.language === 'typescriptreact') && /:\s*any\b/.test(line) && !line.trim().startsWith('//')) {
        issues.push({
          id: nextId(), severity: 'minor', category: 'code-quality',
          file: file.path, line: lineNum,
          title: 'Using `any` type',
          description: 'Loses type safety — bugs may go undetected.',
          suggestion: 'Replace with a specific type or `unknown`.',
        });
      }

      // ── Completeness ──────────────────────────────────────────
      if (/\b(TODO|FIXME|HACK|XXX)\b/.test(line)) {
        const match = line.match(/\b(TODO|FIXME|HACK|XXX)\b/);
        issues.push({
          id: nextId(), severity: 'minor', category: 'completeness',
          file: file.path, line: lineNum,
          title: `${match?.[0] ?? 'TODO'} comment`,
          description: `Incomplete work marker: ${line.trim().slice(0, 100)}`,
          suggestion: 'Complete the task or remove the marker before shipping.',
        });
      }

      if (/(?:lorem ipsum|not implemented)/i.test(line) && !line.trim().startsWith('//') && !line.trim().startsWith('*')) {
        issues.push({
          id: nextId(), severity: 'minor', category: 'completeness',
          file: file.path, line: lineNum,
          title: 'Placeholder content',
          description: 'Contains placeholder or "not implemented" text that should be replaced.',
          suggestion: 'Replace with real content or implementation.',
        });
      }
    }

    // ── File-level checks ─────────────────────────────────────────
    const lineCount = lines.length;
    if (lineCount > 500) {
      issues.push({
        id: nextId(), severity: 'suggestion', category: 'code-quality',
        file: file.path,
        title: 'Large file',
        description: `File has ${lineCount} lines — consider splitting into smaller modules.`,
        suggestion: 'Extract related logic into separate files for maintainability.',
      });
    }

    // Missing error boundary in React component files
    if ((file.language === 'typescriptreact' || file.language === 'javascriptreact') &&
        file.content.includes('fetch(') && !file.content.includes('ErrorBoundary') && !file.content.includes('error boundary')) {
      issues.push({
        id: nextId(), severity: 'suggestion', category: 'error-handling',
        file: file.path,
        title: 'No Error Boundary',
        description: 'React component with data fetching has no Error Boundary for graceful degradation.',
        suggestion: 'Wrap with an Error Boundary component to catch rendering errors.',
      });
    }
  }

  // ── Testing coverage check ──────────────────────────────────────
  const sourceFiles = files.filter(f =>
    !f.path.includes('test') && !f.path.includes('spec') && !f.path.includes('.d.ts') &&
    (f.language === 'typescript' || f.language === 'javascript' || f.language === 'python')
  );
  const testFiles = files.filter(f =>
    f.path.includes('test') || f.path.includes('spec')
  );

  if (sourceFiles.length > 3 && testFiles.length === 0) {
    issues.push({
      id: nextId(), severity: 'major', category: 'testing',
      file: 'project',
      title: 'No test files',
      description: `${sourceFiles.length} source files but no test files found.`,
      suggestion: 'Add unit tests for critical business logic and API endpoints.',
    });
  } else if (sourceFiles.length > 5 && testFiles.length < sourceFiles.length * 0.2) {
    issues.push({
      id: nextId(), severity: 'minor', category: 'testing',
      file: 'project',
      title: 'Low test coverage',
      description: `Only ${testFiles.length} test files for ${sourceFiles.length} source files (~${Math.round(testFiles.length / sourceFiles.length * 100)}% coverage).`,
      suggestion: 'Add tests for untested modules, especially business logic and API routes.',
    });
  }

  return issues;
}

// ─── LLM Deep Review ────────────────────────────────────────────────

const READINESS_SYSTEM_PROMPT = `You are a production readiness auditor. Evaluate the provided code for deployment readiness.

Score each category 0-100:
- security: Authentication, authorization, input validation, secrets handling
- error-handling: Try/catch, user-facing error messages, graceful degradation
- performance: Efficient queries, no N+1, proper caching, lazy loading
- accessibility: WCAG compliance, keyboard nav, screen reader support, semantic HTML
- code-quality: Types, naming, DRY, SOLID, clean architecture
- completeness: No TODOs, no placeholders, all features implemented
- testing: Unit tests, integration tests, edge case coverage

OUTPUT FORMAT (JSON only, no markdown fences):
{
  "categories": {
    "security": { "score": <0-100>, "issues": [{"severity":"critical|major|minor|suggestion","title":"short","description":"detail","suggestion":"fix","file":"path","line":<num|null>}] },
    "error-handling": { "score": <0-100>, "issues": [...] },
    "performance": { "score": <0-100>, "issues": [...] },
    "accessibility": { "score": <0-100>, "issues": [...] },
    "code-quality": { "score": <0-100>, "issues": [...] },
    "completeness": { "score": <0-100>, "issues": [...] },
    "testing": { "score": <0-100>, "issues": [...] }
  },
  "iterationSuggestions": ["actionable improvement 1", "actionable improvement 2", ...]
}

Be specific. Reference actual file paths and line numbers. Focus on actionable findings.
Return ONLY the JSON object.`;

async function llmDeepReview(
  files: Array<{ path: string; content: string; language: string }>,
  featureDescription: string,
  env: EnvConfig,
): Promise<{
  categories: Partial<Record<ReadinessCategory, { score: number; issues: ReadinessIssue[] }>>;
  iterationSuggestions: string[];
  tokensUsed: number;
}> {
  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'qwen3:32b',
    description: 'Production readiness auditor',
    max_tokens: 8192,
    temperature: 0.2,
    estimated_speed: '40-80 TPS',
  };

  const fileContexts = files
    .slice(0, 25)
    .map((f) => {
      const truncated = f.content.length > 3000 ? f.content.slice(0, 3000) + '\n// ... truncated' : f.content;
      return `--- ${f.path} (${f.language}) ---\n${truncated}`;
    })
    .join('\n\n');

  const result = await callModel(
    {
      model: MODEL,
      systemPrompt: READINESS_SYSTEM_PROMPT,
      userMessage: `Feature: ${featureDescription}\n\nCode:\n${fileContexts.slice(0, 15000)}`,
    },
    env,
  );

  // Parse response
  let jsonStr = result.content.trim();
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  const objMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (!objMatch) return { categories: {}, iterationSuggestions: [], tokensUsed: result.tokens_used };

  const parsed = JSON.parse(objMatch[0]) as {
    categories?: Record<string, { score?: number; issues?: Array<{
      severity?: string; title?: string; description?: string; suggestion?: string; file?: string; line?: number | null;
    }> }>;
    iterationSuggestions?: string[];
  };

  const categories: Partial<Record<ReadinessCategory, { score: number; issues: ReadinessIssue[] }>> = {};

  if (parsed.categories) {
    for (const [key, val] of Object.entries(parsed.categories)) {
      const cat = key as ReadinessCategory;
      if (!val) continue;
      categories[cat] = {
        score: typeof val.score === 'number' ? Math.max(0, Math.min(100, val.score)) : 50,
        issues: (val.issues || []).map((iss) => ({
          id: nextId(),
          severity: (['critical', 'major', 'minor', 'suggestion'].includes(iss.severity ?? '') ? iss.severity as ReadinessSeverity : 'minor'),
          category: cat,
          file: iss.file || 'unknown',
          line: typeof iss.line === 'number' ? iss.line : undefined,
          title: iss.title || 'Issue',
          description: iss.description || '',
          suggestion: iss.suggestion || '',
        })),
      };
    }
  }

  return {
    categories,
    iterationSuggestions: parsed.iterationSuggestions || [],
    tokensUsed: result.tokens_used,
  };
}

// ─── Main Scoring Function ──────────────────────────────────────────

const ALL_CATEGORIES: ReadinessCategory[] = [
  'security', 'error-handling', 'performance', 'accessibility',
  'code-quality', 'completeness', 'testing',
];

/**
 * Evaluate production readiness of pipeline output.
 * Runs static checks immediately, then optionally runs LLM deep review.
 */
export async function evaluateReadiness(
  files: Array<{ path: string; content: string; language: string }>,
  featureDescription: string,
  env?: EnvConfig,
  onProgress?: (msg: string) => void,
): Promise<ReadinessScore> {
  onProgress?.('Running static readiness checks...');
  const staticIssues = staticChecks(files);

  // Initialize per-category scores
  const categoryScores: Record<ReadinessCategory, { score: number; issues: number }> = {} as Record<ReadinessCategory, { score: number; issues: number }>;
  for (const cat of ALL_CATEGORIES) {
    categoryScores[cat] = { score: 100, issues: 0 };
  }

  // Apply static issue penalties per category
  for (const issue of staticIssues) {
    const cat = issue.category;
    const penalty = SEVERITY_PENALTY[issue.severity] * (CATEGORY_WEIGHT[cat] || 1);
    categoryScores[cat].score = Math.max(0, categoryScores[cat].score - penalty);
    categoryScores[cat].issues += 1;
  }

  let allIssues = [...staticIssues];
  let tokensUsed = 0;
  let iterationSuggestions: string[] = [];

  // LLM deep review (if env provided and files aren't empty)
  if (env && files.length > 0) {
    onProgress?.('Running AI deep review...');
    try {
      const llmResult = await llmDeepReview(files, featureDescription, env);
      tokensUsed = llmResult.tokensUsed;
      iterationSuggestions = llmResult.iterationSuggestions;

      // Merge LLM scores (average with static)
      for (const [cat, val] of Object.entries(llmResult.categories)) {
        const category = cat as ReadinessCategory;
        if (categoryScores[category] && val) {
          // Weighted average: 40% static, 60% LLM (LLM is more comprehensive)
          categoryScores[category].score = Math.round(
            categoryScores[category].score * 0.4 + val.score * 0.6
          );
          categoryScores[category].issues += val.issues.length;
          allIssues = [...allIssues, ...val.issues];
        }
      }
    } catch {
      onProgress?.('AI review failed — using static analysis only.');
    }
  }

  // Calculate aggregate score (weighted average of all categories)
  let totalWeight = 0;
  let weightedSum = 0;
  for (const cat of ALL_CATEGORIES) {
    const weight = CATEGORY_WEIGHT[cat];
    totalWeight += weight;
    weightedSum += categoryScores[cat].score * weight;
  }
  const aggregateScore = Math.round(weightedSum / totalWeight);

  // Build iteration prompt from issues + suggestions
  const iterationPrompt = buildIterationPrompt(allIssues, iterationSuggestions, aggregateScore);

  onProgress?.(`Readiness score: ${aggregateScore}/100 (${scoreToGrade(aggregateScore)})`);

  return {
    score: aggregateScore,
    grade: scoreToGrade(aggregateScore),
    categories: categoryScores,
    issues: allIssues,
    iterationPrompt,
    evaluatedAt: Date.now(),
    tokensUsed,
  };
}

/**
 * Quick static-only readiness check (no LLM call).
 */
export function quickReadinessCheck(
  files: Array<{ path: string; content: string; language: string }>,
): ReadinessScore {
  const staticIssues = staticChecks(files);

  const categoryScores: Record<ReadinessCategory, { score: number; issues: number }> = {} as Record<ReadinessCategory, { score: number; issues: number }>;
  for (const cat of ALL_CATEGORIES) {
    categoryScores[cat] = { score: 100, issues: 0 };
  }

  for (const issue of staticIssues) {
    const cat = issue.category;
    const penalty = SEVERITY_PENALTY[issue.severity] * (CATEGORY_WEIGHT[cat] || 1);
    categoryScores[cat].score = Math.max(0, categoryScores[cat].score - penalty);
    categoryScores[cat].issues += 1;
  }

  let totalWeight = 0;
  let weightedSum = 0;
  for (const cat of ALL_CATEGORIES) {
    const weight = CATEGORY_WEIGHT[cat];
    totalWeight += weight;
    weightedSum += categoryScores[cat].score * weight;
  }
  const aggregateScore = Math.round(weightedSum / totalWeight);

  return {
    score: aggregateScore,
    grade: scoreToGrade(aggregateScore),
    categories: categoryScores,
    issues: staticIssues,
    iterationPrompt: buildIterationPrompt(staticIssues, [], aggregateScore),
    evaluatedAt: Date.now(),
    tokensUsed: 0,
  };
}

// ─── Iteration Prompt Builder ───────────────────────────────────────

function buildIterationPrompt(
  issues: ReadinessIssue[],
  suggestions: string[],
  score: number,
): string {
  const parts: string[] = [];

  parts.push(`The current build scored ${score}/100 on production readiness. Fix the following issues to improve the score:\n`);

  // Group by severity
  const critical = issues.filter(i => i.severity === 'critical');
  const major = issues.filter(i => i.severity === 'major');
  const minor = issues.filter(i => i.severity === 'minor');
  const suggestionIssues = issues.filter(i => i.severity === 'suggestion');

  if (critical.length > 0) {
    parts.push('## CRITICAL (must fix before deploy)');
    for (const issue of critical) {
      parts.push(`- [${issue.category}] ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.title}`);
      parts.push(`  Fix: ${issue.suggestion}`);
    }
    parts.push('');
  }

  if (major.length > 0) {
    parts.push('## MAJOR (strongly recommended)');
    for (const issue of major) {
      parts.push(`- [${issue.category}] ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.title}`);
      parts.push(`  Fix: ${issue.suggestion}`);
    }
    parts.push('');
  }

  if (minor.length > 0) {
    parts.push(`## MINOR (${minor.length} issues — nice to fix)`);
    // Only list first 10 minor issues to keep prompt manageable
    for (const issue of minor.slice(0, 10)) {
      parts.push(`- [${issue.category}] ${issue.file}: ${issue.title} — ${issue.suggestion}`);
    }
    if (minor.length > 10) {
      parts.push(`  ... and ${minor.length - 10} more minor issues`);
    }
    parts.push('');
  }

  if (suggestionIssues.length > 0) {
    parts.push(`## SUGGESTIONS (${suggestionIssues.length} items)`);
    for (const issue of suggestionIssues.slice(0, 10)) {
      parts.push(`- [${issue.category}] ${issue.file}: ${issue.title} — ${issue.suggestion}`);
    }
    parts.push('');
  }

  if (suggestions.length > 0) {
    parts.push('## AI Suggestions');
    for (const s of suggestions) {
      parts.push(`- ${s}`);
    }
    parts.push('');
  }

  parts.push('Apply these fixes to the generated code. Keep the same architecture and tech stack. Output the corrected files.');

  return parts.join('\n');
}
