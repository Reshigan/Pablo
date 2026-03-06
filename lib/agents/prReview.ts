/**
 * Pablo Review — AI-Powered PR Review
 *
 * Analyzes PR diffs and posts review comments:
 *   Red: Bugs — probable bugs or logic errors
 *   Yellow: Warnings — potential issues, missing edge cases
 *   White: FYI — style suggestions, documentation notes
 *
 * Groups related changes, explains each hunk,
 * and provides an overall summary.
 */

import { callModel, type EnvConfig } from './modelRouter';

export interface ReviewComment {
  path: string;
  line: number;
  severity: 'bug' | 'warning' | 'fyi';
  body: string;
}

export interface PRReviewResult {
  summary: string;
  comments: ReviewComment[];
  score: number;  // 0-100
  lgtm: boolean;
}

const REVIEW_PROMPT = `You are an expert code reviewer. Review the following PR diff.

CATEGORIZE issues as:
BUG: Logic errors, security issues, data loss risks, race conditions
WARNING: Missing error handling, edge cases, performance issues
FYI: Style improvements, documentation suggestions, minor refactors

Be specific. Reference exact line numbers. Be constructive, not nitpicky.
Focus on correctness and security over style.

RESPOND WITH JSON:
{
  "summary": "One paragraph overview of the PR quality",
  "score": 85,
  "lgtm": true,
  "comments": [
    {
      "path": "src/auth/login.ts",
      "line": 42,
      "severity": "bug",
      "body": "SQL injection risk: user input is concatenated directly into the query. Use parameterized queries."
    }
  ]
}

PR DIFF:
{diff}`;

export async function reviewPR(
  diff: string,
  env: EnvConfig,
): Promise<PRReviewResult> {
  const result = await callModel({
    model: {
      provider: 'ollama_cloud',
      model: 'devstral-2:123b',
      description: 'Code review',
      max_tokens: 8192,
      temperature: 0.2,
      estimated_speed: '15-30 TPS',
    },
    systemPrompt: 'You are a senior code reviewer. Output ONLY valid JSON.',
    userMessage: REVIEW_PROMPT.replace('{diff}', diff.slice(0, 50000)),
  }, env);

  const jsonMatch = result.content.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { summary: 'Failed to parse review', comments: [], score: 0, lgtm: false };
  }

  try {
    return JSON.parse(jsonMatch[0]) as PRReviewResult;
  } catch {
    return { summary: 'Failed to parse review JSON', comments: [], score: 0, lgtm: false };
  }
}
