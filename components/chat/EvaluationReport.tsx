'use client';

import { useState } from 'react';
import { AlertTriangle, Bug, Shield, Gauge, TestTube2, Lightbulb, ChevronDown, ChevronRight, Wrench } from 'lucide-react';
import type { EvaluationResult, EvaluationIssue } from '@/lib/agents/repoEvaluator';

interface EvaluationReportProps {
  result: EvaluationResult;
  onFixIssue?: (issue: EvaluationIssue) => void;
}

// ─── Health Score Badge ─────────────────────────────────────────────

function HealthScoreBadge({ score }: { score: number }) {
  const color =
    score >= 90 ? 'text-green-400 border-green-400/30 bg-green-400/10' :
    score >= 70 ? 'text-yellow-400 border-yellow-400/30 bg-yellow-400/10' :
    score >= 50 ? 'text-orange-400 border-orange-400/30 bg-orange-400/10' :
    'text-red-400 border-red-400/30 bg-red-400/10';

  const label =
    score >= 90 ? 'Excellent' :
    score >= 70 ? 'Good' :
    score >= 50 ? 'Needs Work' :
    score >= 30 ? 'Poor' :
    'Critical';

  return (
    <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${color}`}>
      <div className="text-3xl font-bold font-mono">{score}</div>
      <div>
        <div className="text-sm font-semibold">{label}</div>
        <div className="text-xs opacity-70">Health Score</div>
      </div>
    </div>
  );
}

// ─── Issue Card ─────────────────────────────────────────────────────

function IssueCard({ issue, onFix }: { issue: EvaluationIssue; onFix?: () => void }) {
  const severityColor =
    issue.severity === 'critical' ? 'border-l-red-400' :
    issue.severity === 'warning' ? 'border-l-yellow-400' :
    'border-l-blue-400';

  return (
    <div className={`border-l-2 ${severityColor} bg-pablo-panel/50 rounded-r px-3 py-2 mb-1.5`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="font-ui text-xs font-medium text-pablo-text">{issue.title}</div>
          <div className="font-ui text-[11px] text-pablo-text-dim mt-0.5">{issue.description}</div>
          {issue.file && (
            <div className="font-mono text-[10px] text-pablo-text-muted mt-0.5">
              {issue.file}{issue.line ? `:${issue.line}` : ''}
            </div>
          )}
        </div>
        {onFix && issue.suggestedFix && (
          <button
            onClick={onFix}
            className="shrink-0 flex items-center gap-1 rounded bg-pablo-gold/10 px-2 py-1 font-ui text-[10px] font-medium text-pablo-gold hover:bg-pablo-gold/20 transition-colors"
          >
            <Wrench size={10} />
            Fix This
          </button>
        )}
      </div>
      {issue.suggestedFix && (
        <div className="mt-1 font-ui text-[10px] text-pablo-text-muted italic">
          Fix: {issue.suggestedFix}
        </div>
      )}
    </div>
  );
}

// ─── Collapsible Section ────────────────────────────────────────────

function IssueSection({
  title,
  icon: Icon,
  issues,
  color,
  onFixIssue,
}: {
  title: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  issues: EvaluationIssue[];
  color: string;
  onFixIssue?: (issue: EvaluationIssue) => void;
}) {
  const [expanded, setExpanded] = useState(issues.length > 0 && issues.length <= 5);

  if (issues.length === 0) return null;

  const criticalCount = issues.filter((i) => i.severity === 'critical').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  return (
    <div className="mb-2">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-pablo-hover transition-colors"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Icon size={14} className={color} />
        <span className="font-ui text-xs font-medium text-pablo-text">{title}</span>
        <span className="ml-auto flex items-center gap-1.5 font-ui text-[10px]">
          {criticalCount > 0 && (
            <span className="rounded bg-red-400/20 px-1.5 py-0.5 text-red-400">{criticalCount} critical</span>
          )}
          {warningCount > 0 && (
            <span className="rounded bg-yellow-400/20 px-1.5 py-0.5 text-yellow-400">{warningCount} warning</span>
          )}
          {issues.length - criticalCount - warningCount > 0 && (
            <span className="rounded bg-blue-400/20 px-1.5 py-0.5 text-blue-400">
              {issues.length - criticalCount - warningCount} info
            </span>
          )}
        </span>
      </button>
      {expanded && (
        <div className="ml-6 mt-1">
          {issues.map((issue, i) => (
            <IssueCard
              key={`${issue.file}-${issue.title}-${i}`}
              issue={issue}
              onFix={onFixIssue ? () => onFixIssue(issue) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Report Component ──────────────────────────────────────────

export function EvaluationReport({ result, onFixIssue }: EvaluationReportProps) {
  const totalIssues = result.bugs.length + result.security.length + result.quality.length +
    result.performance.length + result.missingTests.length;

  return (
    <div className="space-y-3 rounded-lg border border-pablo-border bg-pablo-bg p-3">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-ui text-sm font-semibold text-pablo-text">Repository Evaluation</h3>
          <p className="font-ui text-[11px] text-pablo-text-dim mt-0.5">
            {result.analysis.totalFiles} files, {result.analysis.totalLines.toLocaleString()} lines &middot;{' '}
            {totalIssues} issue{totalIssues !== 1 ? 's' : ''} found
          </p>
        </div>
        <HealthScoreBadge score={result.healthScore} />
      </div>

      {/* Summary */}
      {result.summary && (
        <div className="rounded bg-pablo-panel/50 px-3 py-2 font-ui text-[11px] text-pablo-text-dim">
          {result.summary}
        </div>
      )}

      {/* Issue Sections */}
      <IssueSection title="Bugs" icon={Bug} issues={result.bugs} color="text-red-400" onFixIssue={onFixIssue} />
      <IssueSection title="Security" icon={Shield} issues={result.security} color="text-orange-400" onFixIssue={onFixIssue} />
      <IssueSection title="Code Quality" icon={AlertTriangle} issues={result.quality} color="text-yellow-400" onFixIssue={onFixIssue} />
      <IssueSection title="Performance" icon={Gauge} issues={result.performance} color="text-blue-400" onFixIssue={onFixIssue} />
      <IssueSection title="Missing Tests" icon={TestTube2} issues={result.missingTests} color="text-purple-400" onFixIssue={onFixIssue} />

      {/* Recommendations */}
      {result.recommendations.length > 0 && (
        <div className="mt-2">
          <div className="flex items-center gap-2 mb-1.5">
            <Lightbulb size={14} className="text-pablo-gold" />
            <span className="font-ui text-xs font-medium text-pablo-text">Recommendations</span>
          </div>
          <ul className="ml-6 space-y-1">
            {result.recommendations.map((rec, i) => (
              <li key={i} className="font-ui text-[11px] text-pablo-text-dim list-disc">
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
