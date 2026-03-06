// lib/agents/repoEvaluator.ts
// Evaluates an entire repository: static analysis + LLM deep review
// Produces a health score (0-100) with categorized issues and recommendations

import { callModel, type EnvConfig } from './modelRouter';
import { analyzeCodebase, buildProjectSummary, type CodebaseAnalysis } from './contextAnalyzer';
import { detectIssues, type HealingIssue } from './selfHealer';

// ─── Types ──────────────────────────────────────────────────────────

export interface EvaluationIssue {
  severity: 'critical' | 'warning' | 'info';
  category: 'bug' | 'security' | 'quality' | 'performance' | 'test' | 'accessibility';
  file: string;
  line?: number;
  title: string;
  description: string;
  suggestedFix?: string;
}

export interface EvaluationResult {
  analysis: CodebaseAnalysis;
  summary: string;
  bugs: EvaluationIssue[];
  security: EvaluationIssue[];
  quality: EvaluationIssue[];
  performance: EvaluationIssue[];
  missingTests: EvaluationIssue[];
  recommendations: string[];
  healthScore: number;
}

// ─── Static Analysis Phase ──────────────────────────────────────────

function mapHealingToEvaluation(file: string, issue: HealingIssue): EvaluationIssue {
  const categoryMap: Record<HealingIssue['type'], EvaluationIssue['category']> = {
    syntax: 'bug',
    type: 'bug',
    import: 'bug',
    runtime: 'bug',
    lint: 'quality',
    logic: 'bug',
    security: 'security',
  };

  return {
    severity: issue.severity === 'error' ? 'critical' : 'warning',
    category: categoryMap[issue.type] || 'quality',
    file,
    line: issue.line,
    title: `${issue.type.toUpperCase()}: ${issue.message.slice(0, 60)}`,
    description: issue.message,
    suggestedFix: issue.autoFixable ? 'Auto-fixable — use Fix mode to resolve' : undefined,
  };
}

// ─── LLM Review Phase ───────────────────────────────────────────────

const EVALUATION_SYSTEM_PROMPT = `You are a senior code reviewer evaluating a codebase for quality, bugs, security, and performance issues.

Analyze the provided codebase and return a JSON object with this exact structure:
{
  "healthScore": <number 0-100>,
  "bugs": [{"severity":"critical"|"warning"|"info","file":"path","line":<number|null>,"title":"short title","description":"detailed description","suggestedFix":"how to fix"}],
  "security": [same structure],
  "quality": [same structure],
  "performance": [same structure],
  "missingTests": [same structure],
  "recommendations": ["string recommendation 1", "string recommendation 2"]
}

SCORING GUIDE:
- 90-100: Excellent — production-ready, well-tested, clean
- 70-89: Good — minor issues, mostly clean
- 50-69: Needs Work — several issues, some patterns to fix
- 30-49: Poor — significant bugs, security issues, bad patterns
- 0-29: Critical — major issues, not safe to deploy

Be specific about file paths and line numbers when possible.
Focus on actionable issues, not style nitpicks.
Return ONLY the JSON object, no markdown fences or explanation.`;

function buildEvaluationPrompt(
  files: Array<{ path: string; content: string; language: string }>,
  projectSummary: string,
  staticIssuesSummary: string,
): string {
  // Build a concise codebase context (limit to avoid token overflow)
  const fileContexts = files
    .slice(0, 30) // Limit files for LLM context
    .map((f) => {
      const truncated = f.content.length > 3000 ? f.content.slice(0, 3000) + '\n// ... truncated' : f.content;
      return `--- ${f.path} (${f.language}) ---\n${truncated}`;
    })
    .join('\n\n');

  return `Evaluate this codebase:

${projectSummary}

STATIC ANALYSIS FINDINGS:
${staticIssuesSummary || 'No static issues detected.'}

CODEBASE:
${fileContexts}

Return a JSON evaluation object with healthScore, bugs, security, quality, performance, missingTests, and recommendations.`;
}

// ─── Main Evaluation Function ───────────────────────────────────────

export async function evaluateRepo(
  files: Array<{ path: string; content: string; language: string }>,
  env: EnvConfig,
  onProgress?: (msg: string) => void,
): Promise<EvaluationResult> {
  // Phase 1: Static analysis
  onProgress?.('Analyzing codebase structure...');
  const analysis = analyzeCodebase(files);
  const summary = buildProjectSummary(analysis);

  // Run detectIssues on each file
  onProgress?.('Scanning for bugs and issues...');
  const allStaticIssues: EvaluationIssue[] = [];
  for (const file of files) {
    if (file.language === 'json' || file.language === 'markdown') continue;
    const issues = detectIssues(file.content, file.language);
    for (const issue of issues) {
      allStaticIssues.push(mapHealingToEvaluation(file.path, issue));
    }
  }

  const staticSummary = allStaticIssues.length > 0
    ? allStaticIssues.map((i) => `- [${i.severity}] ${i.file}: ${i.title}`).join('\n')
    : '';

  // Phase 2: LLM deep review
  onProgress?.('Running AI analysis...');

  const MODEL = {
    provider: 'ollama_cloud' as const,
    model: 'qwen3:32b',
    description: 'Repo evaluator',
    max_tokens: 8192,
    temperature: 0.2,
    estimated_speed: '40-80 TPS',
  };

  let llmResult: {
    healthScore?: number;
    bugs?: EvaluationIssue[];
    security?: EvaluationIssue[];
    quality?: EvaluationIssue[];
    performance?: EvaluationIssue[];
    missingTests?: EvaluationIssue[];
    recommendations?: string[];
  } = {};

  try {
    const prompt = buildEvaluationPrompt(files, summary, staticSummary);
    const response = await callModel(
      { model: MODEL, systemPrompt: EVALUATION_SYSTEM_PROMPT, userMessage: prompt },
      env,
    );

    // Parse JSON from response (handle markdown fences if present)
    let jsonStr = response.content.trim();
    const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      jsonStr = fenceMatch[1].trim();
    }

    try {
      llmResult = JSON.parse(jsonStr);
    } catch {
      // Try to extract JSON object from response
      const objMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (objMatch) {
        try {
          llmResult = JSON.parse(objMatch[0]);
        } catch {
          onProgress?.('Warning: Could not parse LLM evaluation response');
        }
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    onProgress?.(`LLM analysis failed: ${msg}. Using static analysis only.`);
  }

  // Merge static + LLM issues
  const staticBugs = allStaticIssues.filter((i) => i.category === 'bug');
  const staticSecurity = allStaticIssues.filter((i) => i.category === 'security');
  const staticQuality = allStaticIssues.filter((i) => i.category === 'quality');

  onProgress?.('Evaluation complete.');

  return {
    analysis,
    summary,
    bugs: [...staticBugs, ...(llmResult.bugs || [])],
    security: [...staticSecurity, ...(llmResult.security || [])],
    quality: [...staticQuality, ...(llmResult.quality || [])],
    performance: llmResult.performance || [],
    missingTests: llmResult.missingTests || [],
    recommendations: llmResult.recommendations || [],
    healthScore: llmResult.healthScore ?? calculateFallbackScore(allStaticIssues),
  };
}

/**
 * Calculate a fallback health score from static analysis only
 */
function calculateFallbackScore(issues: EvaluationIssue[]): number {
  let score = 100;
  for (const issue of issues) {
    if (issue.severity === 'critical') score -= 10;
    else if (issue.severity === 'warning') score -= 3;
    else score -= 1;
  }
  return Math.max(0, Math.min(100, score));
}
