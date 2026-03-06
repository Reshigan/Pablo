/**
 * StandardsEnforcer — validates generated code against BusinessRulesEngine rules.
 *
 * Phase 1 of the Enterprise AI Division spec: built-in rules only.
 * Runs as part of the enterprise pipeline stage to catch violations before output.
 *
 * Each rule's `pattern` field is a regex that matches file paths.
 * The enforcer scans generated code blocks and reports violations.
 */

import { type BusinessRule, BUILT_IN_RULES, listBusinessRules } from '@/lib/db/d1-business-rules';

export interface Violation {
  ruleId: string;
  ruleTitle: string;
  severity: 'error' | 'warning' | 'info';
  file: string;
  line: number | null;
  message: string;
  suggestedFix: string;
}

export interface EnforcementReport {
  totalFiles: number;
  totalViolations: number;
  errors: number;
  warnings: number;
  infos: number;
  violations: Violation[];
  passRate: string;
}

/**
 * Extract file blocks from pipeline output (markdown code fences with filenames).
 * Returns array of { filename, content, language }.
 */
function extractCodeBlocks(output: string): Array<{ filename: string; content: string; language: string }> {
  const blocks: Array<{ filename: string; content: string; language: string }> = [];
  // Match ```lang filepath\n...content...\n```
  const regex = /```(\w+)\s+([\w/.\\-]+)\n([\s\S]*?)```/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(output)) !== null) {
    blocks.push({
      language: match[1],
      filename: match[2],
      content: match[3],
    });
  }
  return blocks;
}

// ─── Built-in pattern detectors (Phase 1: no LLM calls, pure regex) ────────

interface Detector {
  /** Which built-in rule index this detector maps to */
  ruleIndex: number;
  /** Check a single file. Returns violations found. */
  check: (filename: string, content: string) => Violation[];
}

const DETECTORS: Detector[] = [
  // Rule 0: No hardcoded secrets
  {
    ruleIndex: 0,
    check: (filename, content) => {
      const violations: Violation[] = [];
      const rule = BUILT_IN_RULES[0];
      const patterns = [
        /(?:api[_-]?key|apikey|secret|password|token|auth)\s*[:=]\s*['"`][A-Za-z0-9_\-]{8,}['"`]/gi,
        /(?:sk|pk)[-_](?:live|test)[-_][A-Za-z0-9]{20,}/g,  // Stripe-like keys
        /AIza[A-Za-z0-9_\\-]{35}/g,                          // Google API keys
      ];
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comment lines, .env files, and .env.example
        if (filename.endsWith('.env') || filename.endsWith('.env.example')) continue;
        if (line.trim().startsWith('//') || line.trim().startsWith('#') || line.trim().startsWith('*')) continue;
        for (const pat of patterns) {
          pat.lastIndex = 0;
          if (pat.test(line)) {
            violations.push({
              ruleId: `builtin_0`,
              ruleTitle: rule.title,
              severity: rule.severity,
              file: filename,
              line: i + 1,
              message: `Possible hardcoded secret detected on line ${i + 1}`,
              suggestedFix: rule.action,
            });
            break; // One violation per line is enough
          }
        }
      }
      return violations;
    },
  },

  // Rule 1: Integer cents for money
  {
    ruleIndex: 1,
    check: (filename, content) => {
      const violations: Violation[] = [];
      const rule = BUILT_IN_RULES[1];
      // Look for REAL/FLOAT/DOUBLE/DECIMAL on columns that look financial
      const moneyColRegex = /(?:price|amount|cost|fee|balance|total|revenue|salary|payment|discount|tax)\b[^;]*\b(?:REAL|FLOAT|DOUBLE|DECIMAL|float|double|decimal|Number)\b/gi;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        moneyColRegex.lastIndex = 0;
        if (moneyColRegex.test(lines[i])) {
          violations.push({
            ruleId: `builtin_1`,
            ruleTitle: rule.title,
            severity: rule.severity,
            file: filename,
            line: i + 1,
            message: `Financial column appears to use floating-point type on line ${i + 1}`,
            suggestedFix: rule.action,
          });
        }
      }
      return violations;
    },
  },

  // Rule 3: Structured logging (detect raw console.log in non-test files)
  {
    ruleIndex: 3,
    check: (filename, content) => {
      const violations: Violation[] = [];
      const rule = BUILT_IN_RULES[3];
      // Skip test files and config files
      if (/\.(test|spec|config)\.(ts|tsx|js|jsx)$/.test(filename)) return violations;
      if (filename.includes('node_modules')) return violations;
      const lines = content.split('\n');
      let consoleCount = 0;
      for (let i = 0; i < lines.length; i++) {
        if (/\bconsole\.(log|warn|error|info)\b/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
          consoleCount++;
          if (consoleCount <= 3) { // Report max 3 per file
            violations.push({
              ruleId: `builtin_3`,
              ruleTitle: rule.title,
              severity: rule.severity,
              file: filename,
              line: i + 1,
              message: `Raw console.${lines[i].match(/console\.(\w+)/)?.[1] ?? 'log'} found — use structured logger instead`,
              suggestedFix: rule.action,
            });
          }
        }
      }
      return violations;
    },
  },

  // Rule 9: No floating-point equality
  {
    ruleIndex: 9,
    check: (filename, content) => {
      const violations: Violation[] = [];
      const rule = BUILT_IN_RULES[9];
      if (!/\.(ts|tsx|js|jsx)$/.test(filename)) return violations;
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        // Detect patterns like price === 0.1 or amount == 0.99
        if (/\b\d+\.\d+\s*===?\s*\d+\.\d+\b/.test(lines[i]) ||
            /\b\w+\s*===?\s*\d+\.\d+\b/.test(lines[i])) {
          // Skip string/comment lines
          if (lines[i].trim().startsWith('//') || lines[i].trim().startsWith('*')) continue;
          violations.push({
            ruleId: `builtin_9`,
            ruleTitle: rule.title,
            severity: rule.severity,
            file: filename,
            line: i + 1,
            message: `Floating-point equality comparison on line ${i + 1}`,
            suggestedFix: rule.action,
          });
        }
      }
      return violations;
    },
  },
];

/**
 * Run all built-in detectors against the extracted code blocks.
 */
function runBuiltInChecks(
  blocks: Array<{ filename: string; content: string; language: string }>,
  enabledRules: BusinessRule[]
): Violation[] {
  const violations: Violation[] = [];
  const enabledIds = new Set(enabledRules.map((r) => r.id));

  for (const detector of DETECTORS) {
    const ruleId = `builtin_${detector.ruleIndex}`;
    if (!enabledIds.has(ruleId)) continue;

    const rule = BUILT_IN_RULES[detector.ruleIndex];
    const filePattern = new RegExp(rule.pattern);

    for (const block of blocks) {
      if (!filePattern.test(block.filename)) continue;
      const found = detector.check(block.filename, block.content);
      violations.push(...found);
    }
  }

  return violations;
}

/**
 * Enforce business rules against pipeline stage outputs.
 * Returns a structured enforcement report.
 */
export async function enforceRules(pipelineOutput: string): Promise<EnforcementReport> {
  const blocks = extractCodeBlocks(pipelineOutput);
  let rules: BusinessRule[];
  try {
    rules = await listBusinessRules();
  } catch {
    // Fall back to built-in rules only if D1 is unavailable
    const now = new Date().toISOString();
    rules = BUILT_IN_RULES.map((r, i) => ({ ...r, id: `builtin_${i}`, createdAt: now, updatedAt: now }));
  }
  const enabled = rules.filter((r) => r.enabled);

  const violations = runBuiltInChecks(blocks, enabled);

  const errors = violations.filter((v) => v.severity === 'error').length;
  const warnings = violations.filter((v) => v.severity === 'warning').length;
  const infos = violations.filter((v) => v.severity === 'info').length;
  const totalChecks = blocks.length * enabled.length;
  const passRate = totalChecks > 0
    ? `${Math.max(0, Math.round(((totalChecks - violations.length) / totalChecks) * 100))}%`
    : '100%';

  return {
    totalFiles: blocks.length,
    totalViolations: violations.length,
    errors,
    warnings,
    infos,
    violations,
    passRate,
  };
}

/**
 * Format an enforcement report as a human-readable string for the pipeline.
 */
export function formatReport(report: EnforcementReport): string {
  const lines = [
    `## Standards Enforcement Report`,
    `Files scanned: ${report.totalFiles}`,
    `Violations: ${report.totalViolations} (${report.errors} errors, ${report.warnings} warnings, ${report.infos} info)`,
    `Pass rate: ${report.passRate}`,
    '',
  ];

  if (report.violations.length === 0) {
    lines.push('All checks passed. No violations found.');
  } else {
    const grouped = new Map<string, Violation[]>();
    for (const v of report.violations) {
      const key = v.file;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key)!.push(v);
    }

    for (const [file, fileViolations] of grouped) {
      lines.push(`### ${file}`);
      for (const v of fileViolations) {
        const loc = v.line ? `:${v.line}` : '';
        lines.push(`- **[${v.severity.toUpperCase()}]** ${v.ruleTitle}${loc}: ${v.message}`);
        lines.push(`  Fix: ${v.suggestedFix}`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}
