/**
 * Auto-Fix Loop — Feature 3
 * Detects errors from terminal/preview output and iteratively fixes them via LLM.
 * Pattern: error output → parse → LLM fix → apply → re-run → check → loop
 */

import { autoHeal, detectIssues, type HealingCallback } from './selfHealer';
import { type EnvConfig } from './modelRouter';

export interface AutoFixOptions {
  maxIterations: number;        // default: 3
  autoApply: boolean;           // true = apply without diff review
  onProgress: (msg: string) => void;
  onFixApplied: (filename: string, newContent: string) => void;
  onComplete: (success: boolean, iterations: number) => void;
}

export interface ParsedError {
  type: 'syntax' | 'runtime' | 'build' | 'type' | 'unknown';
  file?: string;
  line?: number;
  message: string;
}

/**
 * Parse error output from terminal/preview and extract structured info.
 */
export function parseError(output: string): ParsedError | null {
  // TypeScript/Build errors: src/App.tsx(12,5): error TS2304
  const tsMatch = output.match(/([^\s]+\.tsx?)\((\d+),\d+\):\s*error\s+TS\d+:\s*(.+)/);
  if (tsMatch) return { type: 'type', file: tsMatch[1], line: parseInt(tsMatch[2]), message: tsMatch[3] };

  // Vite/ESBuild errors: [plugin:vite:react-babel] /src/App.tsx: Unexpected token
  const viteMatch = output.match(/\[plugin:[^\]]+\]\s*(.+\.tsx?)(?::(\d+))?\s*[:]\s*(.+)/);
  if (viteMatch) return { type: 'syntax', file: viteMatch[1], line: viteMatch[2] ? parseInt(viteMatch[2]) : undefined, message: viteMatch[3] };

  // Vite build errors: error during build:
  const viteBuildMatch = output.match(/error during build:\s*(.+)/);
  if (viteBuildMatch) return { type: 'build', message: viteBuildMatch[1] };

  // Node.js runtime errors: TypeError: Cannot read properties of undefined
  const runtimeMatch = output.match(/(TypeError|ReferenceError|SyntaxError|RangeError):\s*(.+)/);
  if (runtimeMatch) return { type: 'runtime', message: `${runtimeMatch[1]}: ${runtimeMatch[2]}` };

  // Python errors
  const pyMatch = output.match(/File "([^"]+)", line (\d+)[\s\S]*?(\w+Error:\s*.+)/);
  if (pyMatch) return { type: 'runtime', file: pyMatch[1], line: parseInt(pyMatch[2]), message: pyMatch[3] };

  // npm install errors
  const npmMatch = output.match(/npm ERR!\s*(.+)/);
  if (npmMatch) return { type: 'build', message: npmMatch[1] };

  // Generic error detection — stricter patterns to avoid false positives
  const errorPattern = /\b(ERR!|FATAL|FAIL|error\s+TS\d|error during|failed to|cannot find|unexpected token|is not defined)\b/i;
  const falsePositivePattern = /\b(no error|0 errors?|error-free|error handling|error boundary|error\.message|onerror|error\s*[:=]\s*(false|null|undefined|none|0)|catch\s*\(error\))\b/i;
  // Test false positives per-line, not on entire output, so unrelated lines don't suppress real errors
  const errorLines = output.split('\n').filter(l => errorPattern.test(l) && !falsePositivePattern.test(l));
  if (errorLines.length > 0) {
    const errorLine = errorLines[0];
    return { type: 'unknown', message: errorLine.trim().slice(0, 300) };
  }

  return null;
}

/**
 * Run the auto-fix loop:
 * 1. Parse error → 2. Read faulty file → 3. LLM fix → 4. Apply → 5. Re-run → 6. Check
 */
export async function runAutoFixLoop(
  errorOutput: string,
  files: Array<{ path: string; content: string; language: string }>,
  env: EnvConfig,
  options: AutoFixOptions,
): Promise<void> {
  const error = parseError(errorOutput);
  if (!error) {
    options.onProgress('No parseable error found in output');
    options.onComplete(true, 0);
    return;
  }

  options.onProgress(`Detected ${error.type} error: ${error.message}`);

  // Find the file with the error
  const targetFile = error.file
    ? files.find(f => f.path.endsWith(error.file!) || f.path === error.file)
    : files[0]; // If no file detected, try the first file

  if (!targetFile) {
    options.onProgress('Could not identify the file with the error');
    options.onComplete(false, 0);
    return;
  }

  const healingCallback: HealingCallback = (event) => {
    options.onProgress(event.message);
  };

  let success = false;
  let completedIterations = 0;

  for (let i = 0; i < options.maxIterations; i++) {
    completedIterations = i + 1;
    options.onProgress(`Auto-fix iteration ${i + 1}/${options.maxIterations}...`);

    try {
      const result = await autoHeal(
        targetFile.content,
        targetFile.language,
        env,
        healingCallback,
        1, // single iteration per loop pass
      );

      if (result.success && result.fixedCode !== targetFile.content) {
        targetFile.content = result.fixedCode;
        options.onFixApplied(targetFile.path, result.fixedCode);
        options.onProgress(`Applied fix to ${targetFile.path} (${result.issuesFixed} issues fixed)`);
        success = true;
      } else if (result.issuesFixed === 0) {
        // Static analysis couldn't find more issues — may need broader context
        options.onProgress('No more fixable issues detected by static analysis');
        break;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      options.onProgress(`Fix attempt failed: ${msg}`);
      break;
    }
  }

  options.onComplete(success, completedIterations);
}

/**
 * Quick check: does terminal output contain an error?
 */
export function hasError(output: string): boolean {
  return parseError(output) !== null;
}
