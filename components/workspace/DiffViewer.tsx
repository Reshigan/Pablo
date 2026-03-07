'use client';

import { GitCommit, ChevronDown, ChevronRight, Plus, Minus, Check, X, CheckCheck, XCircle, Globe } from 'lucide-react';
import { useState, useMemo, useCallback } from 'react';
import { useEditorStore, type DiffHunk } from '@/stores/editor';
import { useUIStore } from '@/stores/ui';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

const LINE_COLORS: Record<DiffLine['type'], string> = {
  added: 'bg-pablo-green/10 text-pablo-green',
  removed: 'bg-pablo-red/10 text-pablo-red',
  unchanged: 'text-pablo-text-dim',
  header: 'bg-pablo-blue/10 text-pablo-blue',
};

const LINE_NUM_COLORS: Record<DiffLine['type'], string> = {
  added: 'text-pablo-green/50',
  removed: 'text-pablo-red/50',
  unchanged: 'text-pablo-text-muted',
  header: 'text-pablo-blue/50',
};

/**
 * Compute a simple unified diff between two strings.
 */
function computeDiffLines(oldText: string, newText: string): { lines: DiffLine[]; additions: number; deletions: number } {
  const oldLines = oldText.split('\n');
  const newLines = newText.split('\n');
  const result: DiffLine[] = [];
  let additions = 0;
  let deletions = 0;

  const m = oldLines.length;
  const n = newLines.length;

  // For very long files, show simple added/removed
  if (m + n > 2000) {
    result.push({ type: 'header', content: `@@ -1,${m} +1,${n} @@` });
    for (let i = 0; i < m; i++) {
      result.push({ type: 'removed', content: oldLines[i], oldLineNum: i + 1 });
      deletions++;
    }
    for (let i = 0; i < n; i++) {
      result.push({ type: 'added', content: newLines[i], newLineNum: i + 1 });
      additions++;
    }
    return { lines: result, additions, deletions };
  }

  // Build LCS table for proper diff
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrack to build diff
  const diffItems: Array<{ type: 'unchanged' | 'removed' | 'added'; line: string; oldNum?: number; newNum?: number }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      diffItems.unshift({ type: 'unchanged', line: oldLines[i - 1], oldNum: i, newNum: j });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      diffItems.unshift({ type: 'added', line: newLines[j - 1], newNum: j });
      j--;
    } else if (i > 0) {
      diffItems.unshift({ type: 'removed', line: oldLines[i - 1], oldNum: i });
      i--;
    }
  }

  result.push({ type: 'header', content: `@@ -1,${m} +1,${n} @@` });
  for (const item of diffItems) {
    if (item.type === 'added') additions++;
    if (item.type === 'removed') deletions++;
    result.push({
      type: item.type,
      content: item.line,
      oldLineNum: item.oldNum,
      newLineNum: item.newNum,
    });
  }

  return { lines: result, additions, deletions };
}

function DiffFileSection({
  diff,
  onAccept,
  onReject,
}: {
  diff: DiffHunk;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const { lines, additions, deletions } = useMemo(
    () => computeDiffLines(diff.oldContent, diff.newContent),
    [diff.oldContent, diff.newContent]
  );

  const isPending = diff.status === 'pending';
  const statusColor = diff.status === 'accepted' ? 'text-pablo-green' : diff.status === 'rejected' ? 'text-pablo-red' : 'text-pablo-gold';
  const statusLabel = diff.status === 'accepted' ? 'Accepted' : diff.status === 'rejected' ? 'Rejected' : 'Pending';

  return (
    <div className="border-b border-pablo-border">
      {/* File header */}
      <div className="flex items-center gap-2 bg-pablo-panel px-3 py-1.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1 flex-1 min-w-0 text-left"
        >
          {expanded ? (
            <ChevronDown size={14} className="shrink-0 text-pablo-text-muted" />
          ) : (
            <ChevronRight size={14} className="shrink-0 text-pablo-text-muted" />
          )}
          <span className="truncate font-code text-xs text-pablo-text">{diff.filename}</span>
        </button>
        <span className="flex items-center gap-1 shrink-0">
          <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-green">
            <Plus size={10} />
            {additions}
          </span>
          <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-red">
            <Minus size={10} />
            {deletions}
          </span>
        </span>
        <span className={`font-ui text-[10px] font-medium ${statusColor}`}>{statusLabel}</span>
        {isPending && (
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={onAccept}
              className="flex h-6 items-center gap-1 rounded bg-pablo-green/10 px-2 font-ui text-[10px] font-medium text-pablo-green transition-colors hover:bg-pablo-green/20"
              title="Accept changes"
            >
              <Check size={12} />
              Accept
            </button>
            <button
              onClick={onReject}
              className="flex h-6 items-center gap-1 rounded bg-pablo-red/10 px-2 font-ui text-[10px] font-medium text-pablo-red transition-colors hover:bg-pablo-red/20"
              title="Reject changes"
            >
              <X size={12} />
              Reject
            </button>
          </div>
        )}
      </div>

      {/* Diff lines */}
      {expanded && (
        <div className="overflow-x-auto">
          {lines.map((line, idx) => (
            <div
              key={`${diff.fileId}-${idx}`}
              className={`flex font-code text-xs leading-5 ${LINE_COLORS[line.type]}`}
            >
              <span className={`w-10 shrink-0 select-none px-1 text-right ${LINE_NUM_COLORS[line.type]}`}>
                {line.oldLineNum ?? ''}
              </span>
              <span className={`w-10 shrink-0 select-none px-1 text-right ${LINE_NUM_COLORS[line.type]}`}>
                {line.newLineNum ?? ''}
              </span>
              <span className="w-5 shrink-0 select-none text-center">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : line.type === 'header' ? '@@' : ' '}
              </span>
              <span className="whitespace-pre px-2">{line.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffViewer() {
  const pendingDiffs = useEditorStore((s) => s.pendingDiffs);
  const acceptDiff = useEditorStore((s) => s.acceptDiff);
  const rejectDiff = useEditorStore((s) => s.rejectDiff);
  const clearDiffs = useEditorStore((s) => s.clearDiffs);

  // Issue 2 + 9: Auto-navigate to preview when all diffs accepted
  const handleAccept = useCallback((fileId: string) => {
    acceptDiff(fileId);
    // Check if all remaining diffs are now accepted
    const remaining = useEditorStore.getState().pendingDiffs;
    const stillPending = remaining.filter(d => d.status === 'pending');
    if (stillPending.length === 0 && remaining.length > 0) {
      useUIStore.getState().setActiveWorkspaceTab('preview');
      useUIStore.getState().setAutoStartPreview(true);
    }
  }, [acceptDiff]);

  const handleAcceptAll = useCallback(() => {
    const diffs = useEditorStore.getState().pendingDiffs;
    for (const d of diffs) {
      if (d.status === 'pending') acceptDiff(d.fileId);
    }
    useUIStore.getState().setActiveWorkspaceTab('preview');
    useUIStore.getState().setAutoStartPreview(true);
  }, [acceptDiff]);

  const handleRejectAll = useCallback(() => {
    const diffs = useEditorStore.getState().pendingDiffs;
    for (const d of diffs) {
      if (d.status === 'pending') rejectDiff(d.fileId);
    }
  }, [rejectDiff]);

  if (pendingDiffs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
        <GitCommit size={40} className="text-pablo-text-muted" />
        <p className="font-ui text-sm text-pablo-text-dim">No diff to display</p>
        <p className="font-ui text-xs text-pablo-text-muted">
          Changes will appear here when Pablo generates or modifies files
        </p>
      </div>
    );
  }

  const pendingCount = pendingDiffs.filter((d) => d.status === 'pending').length;
  const acceptedCount = pendingDiffs.filter((d) => d.status === 'accepted').length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* CHANGE 8: Sticky header with pending diffs count + Accept All & Preview */}
      <div className="sticky top-0 z-10 flex flex-col border-b border-pablo-border bg-pablo-panel">
        <div className="flex items-center gap-3 px-3 py-1.5">
          <span className="font-ui text-xs text-pablo-text-dim">
            {pendingDiffs.length} file{pendingDiffs.length !== 1 ? 's' : ''} changed
          </span>
          {pendingCount > 0 && (
            <span className="flex items-center gap-1 font-ui text-[10px] text-pablo-gold">
              <span className="h-1.5 w-1.5 rounded-full bg-pablo-gold animate-pulse" />
              {pendingCount} pending review
            </span>
          )}
          {acceptedCount > 0 && (
            <span className="font-ui text-[10px] text-pablo-green">{acceptedCount} accepted</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {pendingCount > 0 && (
              <button
                onClick={handleRejectAll}
                className="flex h-6 items-center gap-1 rounded bg-pablo-red/10 px-2 font-ui text-[10px] font-medium text-pablo-red transition-colors hover:bg-pablo-red/20"
              >
                <XCircle size={12} />
                Reject All
              </button>
            )}
            {pendingCount === 0 && (
              <button
                onClick={clearDiffs}
                className="flex h-6 items-center gap-1 rounded bg-pablo-hover px-2 font-ui text-[10px] text-pablo-text-muted transition-colors hover:text-pablo-text-dim"
              >
                Clear
              </button>
            )}
          </div>
        </div>
        {/* Prominent Accept All & Preview button */}
        {pendingCount > 0 && (
          <div className="flex items-center gap-2 border-t border-pablo-border/50 px-3 py-1.5 bg-pablo-gold/5">
            <button
              onClick={handleAcceptAll}
              className="flex h-7 items-center gap-1.5 rounded-lg bg-pablo-gold px-3 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim"
            >
              <CheckCheck size={13} />
              Accept All & Preview
              <Globe size={11} className="ml-0.5" />
            </button>
            <span className="font-ui text-[10px] text-pablo-text-muted">
              Accepts all {pendingCount} pending diff{pendingCount !== 1 ? 's' : ''} and opens live preview
            </span>
          </div>
        )}
      </div>

      {/* Diff list */}
      <div className="flex-1 overflow-y-auto">
        {pendingDiffs.map((diff) => (
          <DiffFileSection
            key={diff.fileId}
            diff={diff}
            onAccept={() => handleAccept(diff.fileId)}
            onReject={() => rejectDiff(diff.fileId)}
          />
        ))}
      </div>
    </div>
  );
}
