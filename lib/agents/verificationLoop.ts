/**
 * Pablo v9 — Execution Verification Loop
 *
 * After code generation:
 *   1. Write files to WebContainer
 *   2. Run `npm install` + `npm run build`
 *   3. Parse errors from stdout/stderr
 *   4. If errors: send to LLM with file context -> get fixes -> apply -> retry
 *   5. Loop up to maxAttempts times
 *   6. Run `npm test` if build passes
 *   7. Return verified files + test results
 */

import { parseGeneratedFiles } from './agentEngine';

export interface VerificationResult {
  passed: boolean;
  buildOutput: string;
  testOutput: string;
  errors: string[];
  fixAttempts: number;
  files: Array<{ path: string; content: string; language: string }>;
}

export interface VerificationCallbacks {
  onStatusChange: (status: 'installing' | 'building' | 'testing' | 'fixing' | 'passed' | 'failed') => void;
  onOutput: (output: string) => void;
  writeFiles: (files: Array<{ path: string; content: string }>) => Promise<void>;
  runCommand: (cmd: string, args: string[]) => Promise<{ output: string; exitCode: number }>;
  /** LLM callback — routes the fix request through the appropriate backend (e.g. /api/chat). */
  callLLM: (prompt: string) => Promise<string>;
}

const FIX_PROMPT = `You are fixing build/test errors in generated code.

ERRORS:
{errors}

FILES WITH ISSUES:
{file_contents}

Fix ALL errors. Output the corrected files as markdown code blocks with filenames.
Only output files that need changes. Every file must be complete (not just the changed lines).`;

/**
 * Run the build-test-fix verification loop
 */
export async function runVerificationLoop(
  files: Array<{ path: string; content: string; language: string }>,
  callbacks: VerificationCallbacks,
  maxAttempts: number = 3,
): Promise<VerificationResult> {
  const currentFiles = [...files];
  let attempt = 0;
  let buildOutput = '';
  let testOutput = '';
  const allErrors: string[] = [];

  while (attempt < maxAttempts) {
    // Write files to WebContainer
    callbacks.onStatusChange(attempt === 0 ? 'installing' : 'fixing');
    await callbacks.writeFiles(currentFiles.map(f => ({ path: f.path, content: f.content })));

    // Install dependencies (only on first attempt)
    if (attempt === 0) {
      callbacks.onOutput('$ npm install\n');
      const installResult = await callbacks.runCommand('npm', ['install']);
      callbacks.onOutput(installResult.output);
      if (installResult.exitCode !== 0) {
        allErrors.push(`npm install failed:\n${installResult.output}`);
      }
    }

    // Build
    callbacks.onStatusChange('building');
    callbacks.onOutput('$ npm run build\n');
    const buildResult = await callbacks.runCommand('npm', ['run', 'build']);
    buildOutput = buildResult.output;
    callbacks.onOutput(buildOutput);

    if (buildResult.exitCode === 0) {
      // Build passed — run tests
      callbacks.onStatusChange('testing');
      callbacks.onOutput('$ npm test\n');
      const testResult = await callbacks.runCommand('npm', ['test']);
      testOutput = testResult.output;
      callbacks.onOutput(testOutput);

      if (testResult.exitCode === 0) {
        // All passed
        callbacks.onStatusChange('passed');
        return {
          passed: true,
          buildOutput,
          testOutput,
          errors: [],
          fixAttempts: attempt,
          files: currentFiles,
        };
      }

      // Tests failed — extract errors for fixing
      allErrors.push(`Test failures:\n${testOutput}`);
    } else {
      // Build failed — extract errors
      allErrors.push(`Build errors:\n${buildOutput}`);
    }

    // Fix attempt
    attempt++;
    if (attempt >= maxAttempts) break;

    callbacks.onStatusChange('fixing');
    callbacks.onOutput(`\n--- Fix attempt ${attempt}/${maxAttempts} ---\n`);

    // Send errors + file contents to LLM for fixing
    const errorText = allErrors.slice(-2).join('\n\n');
    const fileContents = currentFiles
      .map(f => `### ${f.path}\n\`\`\`${f.language}\n${f.content}\n\`\`\``)
      .join('\n\n');

    const prompt = FIX_PROMPT
      .replace('{errors}', errorText)
      .replace('{file_contents}', fileContents);

    try {
      const fixContent = await callbacks.callLLM(prompt);

      const fixedFiles = parseGeneratedFiles(fixContent);

      // Apply fixes — replace only the files that were fixed
      for (const fixed of fixedFiles) {
        const idx = currentFiles.findIndex(f => f.path === fixed.path);
        if (idx >= 0) {
          currentFiles[idx] = fixed;
        } else {
          currentFiles.push(fixed);
        }
      }

      callbacks.onOutput(`Fixed ${fixedFiles.length} files\n`);
    } catch (error) {
      callbacks.onOutput(`Fix generation failed: ${error instanceof Error ? error.message : 'Unknown'}\n`);
    }

    // Clear recent errors for retry
    allErrors.length = 0;
  }

  callbacks.onStatusChange('failed');
  return {
    passed: false,
    buildOutput,
    testOutput,
    errors: allErrors,
    fixAttempts: attempt,
    files: currentFiles,
  };
}
