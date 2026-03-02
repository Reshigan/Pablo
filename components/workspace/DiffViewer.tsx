'use client';

import { GitCommit, ChevronDown, ChevronRight, Plus, Minus, Equal } from 'lucide-react';
import { useState, useCallback } from 'react';

interface DiffLine {
  type: 'added' | 'removed' | 'unchanged' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

interface DiffFile {
  path: string;
  additions: number;
  deletions: number;
  lines: DiffLine[];
}

// Demo diff data for development
const DEMO_DIFFS: DiffFile[] = [
  {
    path: 'src/lib/utils.ts',
    additions: 5,
    deletions: 2,
    lines: [
      { type: 'header', content: '@@ -1,8 +1,11 @@' },
      { type: 'unchanged', content: "import { clsx } from 'clsx';", oldLineNum: 1, newLineNum: 1 },
      { type: 'unchanged', content: "import { twMerge } from 'tailwind-merge';", oldLineNum: 2, newLineNum: 2 },
      { type: 'unchanged', content: '', oldLineNum: 3, newLineNum: 3 },
      { type: 'removed', content: 'export function cn(...inputs: string[]) {', oldLineNum: 4 },
      { type: 'removed', content: '  return twMerge(clsx(inputs));', oldLineNum: 5 },
      { type: 'added', content: 'export function cn(...inputs: ClassValue[]) {', newLineNum: 4 },
      { type: 'added', content: '  return twMerge(clsx(...inputs));', newLineNum: 5 },
      { type: 'unchanged', content: '}', oldLineNum: 6, newLineNum: 6 },
      { type: 'unchanged', content: '', oldLineNum: 7, newLineNum: 7 },
      { type: 'added', content: 'export function formatDate(date: Date): string {', newLineNum: 8 },
      { type: 'added', content: "  return date.toISOString().split('T')[0];", newLineNum: 9 },
      { type: 'added', content: '}', newLineNum: 10 },
    ],
  },
  {
    path: 'src/app/page.tsx',
    additions: 3,
    deletions: 1,
    lines: [
      { type: 'header', content: '@@ -10,6 +10,8 @@' },
      { type: 'unchanged', content: 'export default function Home() {', oldLineNum: 10, newLineNum: 10 },
      { type: 'removed', content: '  return <div>Hello</div>;', oldLineNum: 11 },
      { type: 'added', content: '  return (', newLineNum: 11 },
      { type: 'added', content: '    <main className="flex min-h-screen flex-col">', newLineNum: 12 },
      { type: 'added', content: '      <h1>Welcome to Pablo</h1>', newLineNum: 13 },
      { type: 'unchanged', content: '}', oldLineNum: 12, newLineNum: 14 },
    ],
  },
];

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

function DiffFileSection({ file }: { file: DiffFile }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="border-b border-pablo-border">
      {/* File header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center gap-2 bg-pablo-panel px-3 py-1.5 text-left transition-colors hover:bg-pablo-hover"
      >
        {expanded ? (
          <ChevronDown size={14} className="shrink-0 text-pablo-text-muted" />
        ) : (
          <ChevronRight size={14} className="shrink-0 text-pablo-text-muted" />
        )}
        <span className="flex-1 truncate font-code text-xs text-pablo-text">{file.path}</span>
        <span className="flex items-center gap-1 shrink-0">
          <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-green">
            <Plus size={10} />
            {file.additions}
          </span>
          <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-red">
            <Minus size={10} />
            {file.deletions}
          </span>
        </span>
      </button>

      {/* Diff lines */}
      {expanded && (
        <div className="overflow-x-auto">
          {file.lines.map((line, i) => (
            <div
              key={`${file.path}-${i}`}
              className={`flex font-code text-xs leading-5 ${LINE_COLORS[line.type]}`}
            >
              {/* Old line number */}
              <span className={`w-10 shrink-0 select-none px-1 text-right ${LINE_NUM_COLORS[line.type]}`}>
                {line.oldLineNum ?? ''}
              </span>
              {/* New line number */}
              <span className={`w-10 shrink-0 select-none px-1 text-right ${LINE_NUM_COLORS[line.type]}`}>
                {line.newLineNum ?? ''}
              </span>
              {/* Indicator */}
              <span className="w-5 shrink-0 select-none text-center">
                {line.type === 'added' ? '+' : line.type === 'removed' ? '-' : line.type === 'header' ? '@@' : ' '}
              </span>
              {/* Content */}
              <span className="whitespace-pre px-2">{line.content}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DiffViewer() {
  const [diffs] = useState<DiffFile[]>(DEMO_DIFFS);

  if (diffs.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
        <GitCommit size={40} className="text-pablo-text-muted" />
        <p className="font-ui text-sm text-pablo-text-dim">No diff to display</p>
        <p className="font-ui text-xs text-pablo-text-muted">
          Changes will appear here when Pablo modifies files
        </p>
      </div>
    );
  }

  const totalAdditions = diffs.reduce((sum, f) => sum + f.additions, 0);
  const totalDeletions = diffs.reduce((sum, f) => sum + f.deletions, 0);

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* Header stats */}
      <div className="flex items-center gap-3 border-b border-pablo-border bg-pablo-panel px-3 py-1.5">
        <span className="font-ui text-xs text-pablo-text-dim">
          {diffs.length} file{diffs.length !== 1 ? 's' : ''} changed
        </span>
        <span className="flex items-center gap-0.5 font-code text-xs text-pablo-green">
          <Plus size={12} />
          {totalAdditions}
        </span>
        <span className="flex items-center gap-0.5 font-code text-xs text-pablo-red">
          <Minus size={12} />
          {totalDeletions}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <Equal size={12} className="text-pablo-text-muted" />
          <span className="font-ui text-[10px] text-pablo-text-muted">Unified view</span>
        </div>
      </div>

      {/* Diff content */}
      <div className="flex-1 overflow-y-auto">
        {diffs.map((file) => (
          <DiffFileSection key={file.path} file={file} />
        ))}
      </div>
    </div>
  );
}
