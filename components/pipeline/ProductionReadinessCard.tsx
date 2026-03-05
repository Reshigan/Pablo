'use client';

/**
 * ProductionReadinessCard — Displays production readiness score per build
 * with per-bug breakdown and "Iterate with Suggestions" button.
 */

import { useState, useCallback } from 'react';
import {
  ShieldCheck,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  RotateCcw,
  Zap,
  Eye,
  Bug,
  Code2,
  TestTube2,
  Accessibility,
  CheckCircle2,
} from 'lucide-react';
import type { ReadinessScore, ReadinessCategory, ReadinessSeverity } from '@/lib/agents/productionReadiness';

// ─── Helpers ────────────────────────────────────────────────────────

const CATEGORY_LABELS: Record<ReadinessCategory, { label: string; icon: typeof ShieldCheck }> = {
  'security': { label: 'Security', icon: ShieldCheck },
  'error-handling': { label: 'Error Handling', icon: AlertTriangle },
  'performance': { label: 'Performance', icon: Zap },
  'accessibility': { label: 'Accessibility', icon: Accessibility },
  'code-quality': { label: 'Code Quality', icon: Code2 },
  'completeness': { label: 'Completeness', icon: Eye },
  'testing': { label: 'Testing', icon: TestTube2 },
};

const SEVERITY_COLORS: Record<ReadinessSeverity, string> = {
  critical: 'text-red-400 bg-red-400/10',
  major: 'text-orange-400 bg-orange-400/10',
  minor: 'text-yellow-400 bg-yellow-400/10',
  suggestion: 'text-blue-400 bg-blue-400/10',
};

const SEVERITY_LABELS: Record<ReadinessSeverity, string> = {
  critical: 'CRIT',
  major: 'MAJ',
  minor: 'MIN',
  suggestion: 'SUG',
};

function scoreColor(score: number): string {
  if (score >= 90) return 'text-pablo-green';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-pablo-red';
}

function scoreBgColor(score: number): string {
  if (score >= 90) return 'bg-pablo-green';
  if (score >= 70) return 'bg-yellow-400';
  if (score >= 50) return 'bg-orange-400';
  return 'bg-pablo-red';
}

function gradeColor(grade: string): string {
  switch (grade) {
    case 'A': return 'text-pablo-green border-pablo-green/30 bg-pablo-green/10';
    case 'B': return 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10';
    case 'C': return 'text-orange-400 border-orange-400/30 bg-orange-400/10';
    case 'D': return 'text-orange-500 border-orange-500/30 bg-orange-500/10';
    default: return 'text-pablo-red border-pablo-red/30 bg-pablo-red/10';
  }
}

// ─── Component ──────────────────────────────────────────────────────

interface ProductionReadinessCardProps {
  score: ReadinessScore;
  onIterate?: (prompt: string) => void;
  isEvaluating?: boolean;
}

export function ProductionReadinessCard({ score, onIterate, isEvaluating }: ProductionReadinessCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<Set<ReadinessCategory>>(new Set());
  const [showAllIssues, setShowAllIssues] = useState(false);

  const toggleCategory = useCallback((cat: ReadinessCategory) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const criticalCount = score.issues.filter(i => i.severity === 'critical').length;
  const majorCount = score.issues.filter(i => i.severity === 'major').length;

  const sortedCategories = (Object.keys(CATEGORY_LABELS) as ReadinessCategory[])
    .map(cat => ({ cat, ...score.categories[cat] }))
    .sort((a, b) => a.score - b.score);

  const displayIssues = showAllIssues ? score.issues : score.issues.slice(0, 8);

  return (
    <div className="border-t border-pablo-border">
      {/* ── Score Header ────────────────────────────────────────── */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-3 px-3 py-2.5 transition-colors hover:bg-pablo-hover/50"
      >
        {expanded ? <ChevronDown size={14} className="text-pablo-text-muted" /> : <ChevronRight size={14} className="text-pablo-text-muted" />}

        {/* Grade badge */}
        <span className={`flex h-7 w-7 items-center justify-center rounded-md border font-ui text-xs font-bold ${gradeColor(score.grade)}`}>
          {score.grade}
        </span>

        {/* Score text */}
        <div className="flex flex-1 items-center gap-2 text-left">
          <span className="font-ui text-xs font-medium text-pablo-text">Production Readiness</span>
          <span className={`font-code text-sm font-bold ${scoreColor(score.score)}`}>
            {score.score}/100
          </span>
        </div>

        {/* Issue counts */}
        <div className="flex items-center gap-2">
          {criticalCount > 0 && (
            <span className="rounded-full bg-red-400/10 px-2 py-0.5 font-code text-[10px] text-red-400">
              {criticalCount} critical
            </span>
          )}
          {majorCount > 0 && (
            <span className="rounded-full bg-orange-400/10 px-2 py-0.5 font-code text-[10px] text-orange-400">
              {majorCount} major
            </span>
          )}
          <Bug size={12} className="text-pablo-text-muted" />
          <span className="font-code text-[10px] text-pablo-text-muted">{score.issues.length}</span>
        </div>
      </button>

      {/* ── Score Bar ──────────────────────────────────────────── */}
      <div className="mx-3 mb-2 h-1.5 overflow-hidden rounded-full bg-pablo-active">
        <div
          className={`h-full rounded-full transition-all duration-700 ${scoreBgColor(score.score)}`}
          style={{ width: `${score.score}%` }}
        />
      </div>

      {/* ── Expanded Details ───────────────────────────────────── */}
      {expanded && (
        <div className="px-3 pb-3 space-y-3">
          {/* Category Breakdown */}
          <div className="space-y-1">
            <p className="font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
              Category Scores
            </p>
            <div className="grid gap-1">
              {sortedCategories.map(({ cat, score: catScore, issues: catIssueCount }) => {
                const { label, icon: Icon } = CATEGORY_LABELS[cat];
                const isExpCat = expandedCategories.has(cat);
                const catIssues = score.issues.filter(i => i.category === cat);

                return (
                  <div key={cat}>
                    <button
                      onClick={() => toggleCategory(cat)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 transition-colors hover:bg-pablo-hover/50"
                    >
                      <Icon size={12} className={scoreColor(catScore)} />
                      <span className="flex-1 text-left font-ui text-[11px] text-pablo-text-dim">
                        {label}
                      </span>
                      <div className="flex items-center gap-2">
                        {catIssueCount > 0 && (
                          <span className="font-code text-[9px] text-pablo-text-muted">
                            {catIssueCount} issue{catIssueCount !== 1 ? 's' : ''}
                          </span>
                        )}
                        <div className="h-1 w-16 overflow-hidden rounded-full bg-pablo-active">
                          <div
                            className={`h-full rounded-full ${scoreBgColor(catScore)}`}
                            style={{ width: `${catScore}%` }}
                          />
                        </div>
                        <span className={`w-8 text-right font-code text-[10px] font-medium ${scoreColor(catScore)}`}>
                          {catScore}
                        </span>
                      </div>
                    </button>

                    {/* Category Issues */}
                    {isExpCat && catIssues.length > 0 && (
                      <div className="ml-5 mt-1 mb-1 space-y-1">
                        {catIssues.map((issue) => (
                          <div
                            key={issue.id}
                            className="rounded-md bg-pablo-active/50 px-2 py-1.5"
                          >
                            <div className="flex items-start gap-2">
                              <span className={`shrink-0 rounded px-1.5 py-0.5 font-code text-[8px] font-bold uppercase ${SEVERITY_COLORS[issue.severity]}`}>
                                {SEVERITY_LABELS[issue.severity]}
                              </span>
                              <div className="min-w-0 flex-1">
                                <p className="font-ui text-[11px] font-medium text-pablo-text">
                                  {issue.title}
                                </p>
                                <p className="font-ui text-[10px] text-pablo-text-muted">
                                  {issue.file}{issue.line ? `:${issue.line}` : ''}
                                </p>
                                {issue.suggestion && (
                                  <p className="mt-0.5 font-ui text-[10px] text-pablo-text-dim italic">
                                    Fix: {issue.suggestion}
                                  </p>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {isExpCat && catIssues.length === 0 && (
                      <div className="ml-5 mt-1 mb-1 flex items-center gap-1.5 px-2 py-1">
                        <CheckCircle2 size={11} className="text-pablo-green" />
                        <span className="font-ui text-[10px] text-pablo-green">No issues found</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* All Issues Table */}
          {score.issues.length > 0 && (
            <div className="space-y-1">
              <p className="font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
                All Issues ({score.issues.length})
              </p>
              <div className="max-h-48 overflow-y-auto space-y-1 rounded-md bg-pablo-active/30 p-1.5">
                {displayIssues.map((issue) => (
                  <div
                    key={issue.id}
                    className="flex items-start gap-2 rounded px-1.5 py-1 transition-colors hover:bg-pablo-hover/30"
                  >
                    <span className={`mt-0.5 shrink-0 rounded px-1 py-0.5 font-code text-[7px] font-bold uppercase ${SEVERITY_COLORS[issue.severity]}`}>
                      {SEVERITY_LABELS[issue.severity]}
                    </span>
                    <div className="min-w-0 flex-1">
                      <span className="font-ui text-[10px] text-pablo-text">{issue.title}</span>
                      <span className="ml-1.5 font-code text-[9px] text-pablo-text-muted">
                        {issue.file}{issue.line ? `:${issue.line}` : ''}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {score.issues.length > 8 && (
                <button
                  onClick={() => setShowAllIssues(!showAllIssues)}
                  className="font-ui text-[10px] text-pablo-gold hover:underline"
                >
                  {showAllIssues ? 'Show less' : `Show all ${score.issues.length} issues`}
                </button>
              )}
            </div>
          )}

          {/* Iterate Button */}
          {onIterate && score.score < 95 && (
            <button
              onClick={() => onIterate(score.iterationPrompt)}
              disabled={isEvaluating}
              className="flex w-full items-center justify-center gap-2 rounded-lg border border-pablo-gold/30 bg-pablo-gold-bg px-4 py-2 font-ui text-xs font-medium text-pablo-gold transition-colors hover:bg-pablo-gold/20 disabled:opacity-50"
            >
              <RotateCcw size={13} />
              Iterate with {criticalCount + majorCount} fix suggestions
            </button>
          )}

          {/* Score >= 95: all clear */}
          {score.score >= 95 && (
            <div className="flex items-center justify-center gap-2 rounded-lg bg-pablo-green/10 px-4 py-2">
              <CheckCircle2 size={14} className="text-pablo-green" />
              <span className="font-ui text-xs font-medium text-pablo-green">
                Production ready! Score {score.score}/100
              </span>
            </div>
          )}

          {/* Metadata */}
          <div className="flex items-center gap-3 border-t border-pablo-border/30 pt-1.5">
            <span className="font-code text-[9px] text-pablo-text-muted">
              {new Date(score.evaluatedAt).toLocaleTimeString()}
            </span>
            {score.tokensUsed > 0 && (
              <span className="font-code text-[9px] text-pablo-text-muted">
                {score.tokensUsed} tokens
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
