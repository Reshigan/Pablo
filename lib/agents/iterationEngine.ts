/**
 * IterationEngine — Automatic score-to-100 loop
 *
 * Flow:
 * 1. Pipeline completes → readiness score computed
 * 2. If score < targetScore → build iteration prompt from issues
 * 3. Feed iteration prompt + current files through targeted stages (not full 9-stage)
 * 4. Merge fixed files back into the file set
 * 5. Re-score
 * 6. Repeat until targetScore reached OR maxIterations exhausted
 *
 * Targeted stages per issue category:
 *   security       → run 'review' stage with security focus
 *   error-handling  → run 'review' stage with error-handling focus
 *   completeness    → run 'implement' stage (fill in TODOs/placeholders)
 *   testing         → run 'tests' stage (generate missing tests)
 *   code-quality    → run 'review' stage with refactor focus
 *   performance     → run 'review' stage with perf focus
 *   accessibility   → run 'ux_validation' stage
 */

import { evaluateReadiness, type ReadinessScore, type ReadinessCategory } from './productionReadiness';
import type { EnvConfig } from './modelRouter';

export interface IterationConfig {
  targetScore: number;       // Default: 95 (not 100 — diminishing returns)
  maxIterations: number;     // Default: 5
  autoApprove: boolean;      // If false, pause after each iteration for user review
  focusCategories?: ReadinessCategory[]; // If set, only fix these categories
}

export interface IterationResult {
  initialScore: number;
  finalScore: number;
  iterations: number;
  scores: number[];          // Score after each iteration
  totalTokensUsed: number;
  totalDurationMs: number;
  files: Array<{ path: string; content: string; language: string }>;
  converged: boolean;        // True if targetScore was reached
  history: IterationStep[];
}

export interface IterationStep {
  iteration: number;
  scoreBefore: number;
  scoreAfter: number;
  issuesFixed: number;
  issuesRemaining: number;
  stagesRun: string[];
  tokensUsed: number;
  durationMs: number;
}

export type IterationCallback = (event: IterationEvent) => void;

export type IterationEvent =
  | { type: 'iteration_start'; iteration: number; currentScore: number; targetScore: number }
  | { type: 'stage_start'; iteration: number; stage: string; issueCount: number }
  | { type: 'stage_complete'; iteration: number; stage: string; filesFixed: number }
  | { type: 'score_update'; iteration: number; oldScore: number; newScore: number; grade: string }
  | { type: 'converged'; finalScore: number; iterations: number }
  | { type: 'max_iterations'; finalScore: number; iterations: number }
  | { type: 'stalled'; score: number; message: string };

// Map issue categories to the pipeline stages that fix them
const CATEGORY_TO_STAGE: Record<ReadinessCategory, string[]> = {
  'security': ['review'],
  'error-handling': ['review'],
  'performance': ['review'],
  'accessibility': ['ux_validation'],
  'code-quality': ['review'],
  'completeness': ['implement'],
  'testing': ['tests'],
};

function scoreToGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

export async function runIterationLoop(
  files: Array<{ path: string; content: string; language: string }>,
  featureDescription: string,
  env: EnvConfig,
  config: IterationConfig,
  onEvent: IterationCallback,
  /** Function that runs a single pipeline stage and returns fixed files */
  runStage: (stage: string, prompt: string, files: Array<{ path: string; content: string; language: string }>) => Promise<Array<{ path: string; content: string; language: string }>>,
): Promise<IterationResult> {
  const startTime = Date.now();
  const currentFiles = [...files];
  let totalTokens = 0;
  const scores: number[] = [];
  const history: IterationStep[] = [];

  // Initial score
  const initialResult = await evaluateReadiness(currentFiles, featureDescription, env);
  let currentScore: ReadinessScore = initialResult;
  scores.push(currentScore.score);

  for (let i = 0; i < config.maxIterations; i++) {
    if (currentScore.score >= config.targetScore) {
      onEvent({ type: 'converged', finalScore: currentScore.score, iterations: i });
      break;
    }

    onEvent({ type: 'iteration_start', iteration: i + 1, currentScore: currentScore.score, targetScore: config.targetScore });

    const iterStart = Date.now();
    let iterTokens = 0;
    let issuesFixed = 0;
    const stagesRun: string[] = [];

    // Determine which stages to run based on issue categories
    const stagesToRun = new Set<string>();
    const issuesByCategory = new Map<ReadinessCategory, typeof currentScore.issues>();

    for (const issue of currentScore.issues) {
      if (config.focusCategories && !config.focusCategories.includes(issue.category)) continue;
      if (!issuesByCategory.has(issue.category)) issuesByCategory.set(issue.category, []);
      issuesByCategory.get(issue.category)!.push(issue);
      const stages = CATEGORY_TO_STAGE[issue.category] || ['review'];
      stages.forEach(s => stagesToRun.add(s));
    }

    // Run each needed stage with focused fix prompt
    for (const stage of stagesToRun) {
      const relevantIssues = currentScore.issues.filter(iss => {
        const stagesForCat = CATEGORY_TO_STAGE[iss.category] || ['review'];
        return stagesForCat.includes(stage);
      });
      if (relevantIssues.length === 0) continue;

      onEvent({ type: 'stage_start', iteration: i + 1, stage, issueCount: relevantIssues.length });

      // Build a focused fix prompt from the iteration prompt
      const fixPrompt = buildFocusedFixPrompt(relevantIssues, currentFiles, stage);

      try {
        const fixedFiles = await runStage(stage, fixPrompt, currentFiles);

        // Merge fixed files back (only update files that changed)
        for (const fixed of fixedFiles) {
          const idx = currentFiles.findIndex(f => f.path === fixed.path);
          if (idx >= 0) {
            currentFiles[idx] = fixed;
            issuesFixed++;
          } else {
            currentFiles.push(fixed);
            issuesFixed++;
          }
        }
        stagesRun.push(stage);

        onEvent({ type: 'stage_complete', iteration: i + 1, stage, filesFixed: fixedFiles.length });
      } catch {
        // Stage failed — continue with other stages
      }
    }

    // Re-score after fixes
    const newScore = await evaluateReadiness(currentFiles, featureDescription, env);
    totalTokens += newScore.tokensUsed;
    iterTokens += newScore.tokensUsed;

    onEvent({ type: 'score_update', iteration: i + 1, oldScore: currentScore.score, newScore: newScore.score, grade: scoreToGrade(newScore.score) });

    history.push({
      iteration: i + 1,
      scoreBefore: currentScore.score,
      scoreAfter: newScore.score,
      issuesFixed,
      issuesRemaining: newScore.issues.length,
      stagesRun,
      tokensUsed: iterTokens,
      durationMs: Date.now() - iterStart,
    });

    scores.push(newScore.score);

    // Stall detection — if score didn't improve, stop
    if (newScore.score <= currentScore.score && i > 0) {
      onEvent({ type: 'stalled', score: newScore.score, message: `Score did not improve (${currentScore.score} → ${newScore.score}). Stopping iteration.` });
      currentScore = newScore;
      break;
    }

    currentScore = newScore;
  }

  if (currentScore.score < config.targetScore && history.length >= config.maxIterations) {
    onEvent({ type: 'max_iterations', finalScore: currentScore.score, iterations: config.maxIterations });
  }

  return {
    initialScore: scores[0],
    finalScore: currentScore.score,
    iterations: history.length,
    scores,
    totalTokensUsed: totalTokens,
    totalDurationMs: Date.now() - startTime,
    files: currentFiles,
    converged: currentScore.score >= config.targetScore,
    history,
  };
}

function buildFocusedFixPrompt(
  issues: Array<{ severity: string; category: string; file: string; line?: number; title: string; description: string; suggestion: string }>,
  files: Array<{ path: string; content: string; language: string }>,
  stage: string,
): string {
  const parts: string[] = [];

  parts.push(`You are fixing ${issues.length} production readiness issues in stage: ${stage}.`);
  parts.push('Fix ALL of the following issues. Output complete corrected files.\n');

  for (const issue of issues.slice(0, 20)) { // Cap at 20 issues per prompt
    parts.push(`- [${issue.severity.toUpperCase()}] ${issue.file}${issue.line ? `:${issue.line}` : ''}: ${issue.title}`);
    parts.push(`  Problem: ${issue.description}`);
    parts.push(`  Fix: ${issue.suggestion}\n`);
  }

  // Include the affected files for context
  const affectedPaths = new Set(issues.map(i => i.file));
  const affectedFiles = files.filter(f => affectedPaths.has(f.path));

  if (affectedFiles.length > 0) {
    parts.push('\n## Current files to fix:\n');
    for (const f of affectedFiles.slice(0, 10)) {
      parts.push(`\`\`\`${f.language} ${f.path}`);
      parts.push(f.content.slice(0, 4000));
      parts.push('```\n');
    }
  }

  parts.push('Output the COMPLETE corrected files. Every file must be a full replacement, not a diff.');
  return parts.join('\n');
}
