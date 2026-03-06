// lib/agents/selfHealer.ts
// Auto-fix system: detects errors in generated code and fixes them iteratively
// Devin pattern: run code, check errors, fix, repeat until clean

import { callModel, type EnvConfig } from './modelRouter';

export interface HealingIssue {
  type: 'syntax' | 'type' | 'import' | 'runtime' | 'lint' | 'logic' | 'security';
  message: string;
  file?: string;
  line?: number;
  severity: 'error' | 'warning';
  autoFixable: boolean;
}

export interface HealingResult {
  originalCode: string;
  fixedCode: string;
  issuesFound: HealingIssue[];
  issuesFixed: number;
  iterations: number;
  success: boolean;
}

export interface HealingAttempt {
  iteration: number;
  issuesBefore: number;
  issuesAfter: number;
  fixApplied: string;
  tokensUsed: number;
}

export type HealingCallback = (event: {
  type: 'detect' | 'fixing' | 'fixed' | 'failed' | 'complete';
  message: string;
  iteration?: number;
  issues?: HealingIssue[];
}) => void;

// ─── Static Analysis ─────────────────────────────────────────────────

/**
 * Detect issues in code without running it
 */
export function detectIssues(code: string, language: string): HealingIssue[] {
  const issues: HealingIssue[] = [];

  if (language === 'typescript' || language === 'javascript' || language === 'typescriptreact' || language === 'javascriptreact') {
    issues.push(...detectTSIssues(code));
  } else if (language === 'python') {
    issues.push(...detectPythonIssues(code));
  }

  // Universal checks
  issues.push(...detectUniversalIssues(code));

  return issues;
}

function detectTSIssues(code: string): HealingIssue[] {
  const issues: HealingIssue[] = [];

  // Missing imports for common identifiers
  const usedIdentifiers = new Set<string>();
  const importedIdentifiers = new Set<string>();

  // Track imports
  const importRe = /import\s+\{([^}]+)\}\s+from/g;
  let match: RegExpExecArray | null;
  while ((match = importRe.exec(code)) !== null) {
    match[1].split(',').forEach((id) => importedIdentifiers.add(id.trim().split(' as ')[0].trim()));
  }
  const defaultImportRe = /import\s+(\w+)\s+from/g;
  while ((match = defaultImportRe.exec(code)) !== null) {
    importedIdentifiers.add(match[1]);
  }

  // Track usage of React hooks
  const hookRe = /\b(useState|useEffect|useCallback|useMemo|useRef|useContext|useReducer)\b/g;
  while ((match = hookRe.exec(code)) !== null) {
    usedIdentifiers.add(match[1]);
  }

  for (const id of usedIdentifiers) {
    if (!importedIdentifiers.has(id) && !code.includes(`function ${id}`) && !code.includes(`const ${id} =`)) {
      issues.push({
        type: 'import',
        message: `"${id}" is used but not imported`,
        severity: 'error',
        autoFixable: true,
      });
    }
  }

  // Unclosed brackets/braces
  const opens = (code.match(/\{/g) || []).length;
  const closes = (code.match(/\}/g) || []).length;
  if (opens !== closes) {
    issues.push({
      type: 'syntax',
      message: `Mismatched braces: ${opens} opening vs ${closes} closing`,
      severity: 'error',
      autoFixable: false,
    });
  }

  // console.log left in production code
  if (/console\.log\(/.test(code) && !/\/\/.*console/.test(code)) {
    issues.push({
      type: 'lint',
      message: 'console.log statements in production code',
      severity: 'warning',
      autoFixable: true,
    });
  }

  // any type usage
  const anyCount = (code.match(/:\s*any\b/g) || []).length;
  if (anyCount > 0) {
    issues.push({
      type: 'type',
      message: `${anyCount} "any" type annotations found — use proper types`,
      severity: 'warning',
      autoFixable: false,
    });
  }

  return issues;
}

function detectPythonIssues(code: string): HealingIssue[] {
  const issues: HealingIssue[] = [];

  // Missing __init__ in class
  const classRe = /class\s+(\w+)(?:\([^)]*\))?\s*:/g;
  let match: RegExpExecArray | null;
  while ((match = classRe.exec(code)) !== null) {
    const className = match[1];
    // Check if class has __init__ (rough check)
    const classEnd = code.indexOf('\nclass ', match.index + 1);
    const classBody = classEnd > 0
      ? code.slice(match.index, classEnd)
      : code.slice(match.index);
    if (!classBody.includes('__init__') && !classBody.includes('Base)') && !classBody.includes('BaseModel)')) {
      issues.push({
        type: 'logic',
        message: `Class "${className}" has no __init__ method`,
        severity: 'warning',
        autoFixable: false,
      });
    }
  }

  // Bare except
  if (/except\s*:/g.test(code)) {
    issues.push({
      type: 'logic',
      message: 'Bare except clause — should catch specific exceptions',
      severity: 'warning',
      autoFixable: true,
    });
  }

  // f-string without f prefix
  const fstringRe = /[^f]"[^"]*\{[a-zA-Z_]\w*\}[^"]*"/g;
  if (fstringRe.test(code)) {
    issues.push({
      type: 'syntax',
      message: 'String with curly braces but missing f-prefix',
      severity: 'warning',
      autoFixable: true,
    });
  }

  // TODO/FIXME/HACK/pass placeholders
  const todoCount = (code.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;
  const passCount = (code.match(/^\s*pass\s*$/gm) || []).length;
  if (todoCount > 0 || passCount > 0) {
    issues.push({
      type: 'logic',
      message: `${todoCount} TODO/FIXME markers and ${passCount} pass placeholders — incomplete implementation`,
      severity: 'warning',
      autoFixable: false,
    });
  }

  return issues;
}

function detectUniversalIssues(code: string): HealingIssue[] {
  const issues: HealingIssue[] = [];

  // Hardcoded secrets
  const secretPatterns = [
    /(?:password|secret|token|api_key|apikey)\s*=\s*['"][A-Za-z0-9+/=]{8,}['"]/gi,
    /sk-[a-zA-Z0-9]{20,}/g,
    /ghp_[a-zA-Z0-9]{36}/g,
  ];
  for (const pattern of secretPatterns) {
    if (pattern.test(code)) {
      issues.push({
        type: 'security',
        message: 'Possible hardcoded secret/credential detected',
        severity: 'error',
        autoFixable: false,
      });
      break;
    }
  }

  // Very long lines (>200 chars) suggest formatting issues
  const lines = code.split('\n');
  const longLines = lines.filter((l) => l.length > 200).length;
  if (longLines > 5) {
    issues.push({
      type: 'lint',
      message: `${longLines} lines over 200 characters — needs formatting`,
      severity: 'warning',
      autoFixable: true,
    });
  }

  return issues;
}

// ─── Auto-Fix Loop ───────────────────────────────────────────────────

const FIX_PROMPT = `You are a code repair agent. Fix ALL issues listed below in the provided code.

RULES:
1. Fix every issue listed — do not skip any
2. Return the COMPLETE fixed file content
3. Do not add new features — only fix the issues
4. Maintain the same code style and structure
5. Add missing imports at the top
6. Remove console.log/print debug statements

Return ONLY the fixed code in a single code block. No explanations.`;

/**
 * Attempt to auto-fix detected issues using LLM
 */
export async function autoHeal(
  code: string,
  language: string,
  env: EnvConfig,
  onProgress?: HealingCallback,
  maxIterations: number = 3,
): Promise<HealingResult> {
  let currentCode = code;
  let allIssuesFound: HealingIssue[] = [];
  let totalFixed = 0;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const issues = detectIssues(currentCode, language);
    allIssuesFound = [...allIssuesFound, ...issues.filter((i) => !allIssuesFound.some((a) => a.message === i.message))];

    const fixableErrors = issues.filter((i) => i.severity === 'error' && i.autoFixable);
    const fixableWarnings = issues.filter((i) => i.severity === 'warning' && i.autoFixable);
    const fixable = [...fixableErrors, ...fixableWarnings];

    if (fixable.length === 0) {
      onProgress?.({ type: 'complete', message: `No more fixable issues (${totalFixed} fixed in ${iteration} iterations)` });
      return {
        originalCode: code,
        fixedCode: currentCode,
        issuesFound: allIssuesFound,
        issuesFixed: totalFixed,
        iterations: iteration,
        success: true,
      };
    }

    onProgress?.({
      type: 'fixing',
      message: `Iteration ${iteration + 1}: fixing ${fixable.length} issues`,
      iteration: iteration + 1,
      issues: fixable,
    });

    const issueList = fixable.map((i) => `- [${i.type.toUpperCase()}] ${i.message}`).join('\n');

    const prompt = `Fix these issues in the code:

ISSUES:
${issueList}

CODE:
\`\`\`${language}
${currentCode}
\`\`\`

Return the COMPLETE fixed code in a single code block.`;

    const MODEL = {
      provider: 'ollama_cloud' as const,
      model: 'qwen2.5-coder:32b',
      description: 'Code fixer',
      max_tokens: 16384,
      temperature: 0.1,
      estimated_speed: '40-80 TPS',
    };

    try {
      const result = await callModel(
        { model: MODEL, systemPrompt: FIX_PROMPT, userMessage: prompt },
        env,
      );

      const codeMatch = result.content.match(/```[\w]*\n([\s\S]*?)```/);
      if (codeMatch) {
        currentCode = codeMatch[1].trim();
        totalFixed += fixable.length;
        onProgress?.({ type: 'fixed', message: `Fixed ${fixable.length} issues`, iteration: iteration + 1 });
      } else {
        // LLM didn't return in expected format — use response as-is if it looks like code
        if (result.content.length > 50 && !result.content.startsWith('I ') && !result.content.startsWith('Here')) {
          currentCode = result.content.trim();
          totalFixed += fixable.length;
        } else {
          onProgress?.({ type: 'failed', message: 'LLM response not in expected format', iteration: iteration + 1 });
          break;
        }
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      onProgress?.({ type: 'failed', message: `Fix attempt failed: ${msg}`, iteration: iteration + 1 });
      break;
    }
  }

  return {
    originalCode: code,
    fixedCode: currentCode,
    issuesFound: allIssuesFound,
    issuesFixed: totalFixed,
    iterations: maxIterations,
    success: totalFixed > 0,
  };
}

/**
 * Quick check: does this code have any critical issues?
 */
export function hasCriticalIssues(code: string, language: string): boolean {
  const issues = detectIssues(code, language);
  return issues.some((i) => i.severity === 'error');
}
