'use client';

/**
 * @-Mentions Dropdown — Feature 8
 * Shows a dropdown of files, directories, and special contexts when user types @.
 * Selected items are included as context in the pipeline prompt.
 */

import {
  AlertCircle,
  Database,
  FileCode2,
  FileText,
  GitCompareArrows,
} from 'lucide-react';
import { useMemo } from 'react';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';

export interface MentionItem {
  type: 'file' | 'directory' | 'special';
  label: string;
  value: string;
  description?: string;
}

interface MentionDropdownProps {
  query: string;
  onSelect: (item: MentionItem) => void;
  position: { top: number; left: number };
}

export function MentionDropdown({ query, onSelect, position }: MentionDropdownProps) {
  const tabs = useEditorStore((s) => s.tabs);
  const runs = usePipelineStore((s) => s.runs);

  const items: MentionItem[] = useMemo(() => {
    const specials: MentionItem[] = [
      { type: 'special', label: '@errors', value: 'errors', description: 'Terminal/preview errors' },
      { type: 'special', label: '@schema', value: 'schema', description: 'Database schema' },
      { type: 'special', label: '@plan', value: 'plan', description: 'Last pipeline plan' },
      { type: 'special', label: '@diff', value: 'diff', description: 'Current diff' },
    ];

    const fileItems: MentionItem[] = tabs
      .filter((f) => f.content)
      .map((f) => ({
        type: 'file' as const,
        label: `@${f.path}`,
        value: f.path,
        description: `${f.language} — ${f.content.split('\n').length} lines`,
      }));

    return [...specials, ...fileItems];
  }, [tabs]);

  // Suppress unused variable warning — runs is used for reactivity to plan data
  void runs;

  const filtered = query
    ? items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()))
    : items;

  if (filtered.length === 0) return null;

  return (
    <div
      className="absolute z-50 max-h-60 w-72 overflow-y-auto rounded-lg border border-pablo-border bg-pablo-bg shadow-xl"
      style={{ top: position.top, left: position.left }}
    >
      {filtered.map((item) => {
        const Icon =
          item.value === 'errors' ? AlertCircle :
          item.value === 'schema' ? Database :
          item.value === 'plan' ? FileText :
          item.value === 'diff' ? GitCompareArrows :
          FileCode2;

        return (
          <button
            key={item.value}
            onClick={() => onSelect(item)}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors hover:bg-pablo-hover"
          >
            <Icon size={12} className={item.type === 'special' ? 'text-pablo-gold' : 'text-pablo-text-muted'} />
            <span className="font-ui text-xs text-pablo-text">{item.label}</span>
            {item.description && (
              <span className="ml-auto font-ui text-[10px] text-pablo-text-muted truncate max-w-[120px]">
                {item.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Resolve @-mentions into actual content for injection into prompts.
 */
export function resolveMentions(mentions: string[]): string {
  const parts: string[] = [];

  const editorStore = useEditorStore.getState();
  const pipelineStore = usePipelineStore.getState();

  for (const mention of mentions) {
    if (mention === 'errors') {
      // Get latest terminal errors — stored in a global if available
      parts.push('## Terminal Errors\n(Include any recent error output from the terminal/preview)');
    } else if (mention === 'schema') {
      // Get DB schema from editor tabs
      const schemaFile = editorStore.tabs.find(
        (t) => t.path.includes('schema') || t.path.includes('migration') || t.path.endsWith('.sql')
      );
      if (schemaFile) {
        parts.push(`## Database Schema\n\`\`\`${schemaFile.language}\n${schemaFile.content}\n\`\`\``);
      }
    } else if (mention === 'plan') {
      // Get last pipeline plan output
      const lastRun = pipelineStore.runs[0];
      const planStage = lastRun?.stages.find((s) => s.stage === 'plan');
      if (planStage?.output) {
        parts.push(`## Previous Plan\n${planStage.output}`);
      }
    } else if (mention === 'diff') {
      // Get current pending diffs
      const diffs = editorStore.pendingDiffs.filter((d) => d.status === 'pending');
      if (diffs.length > 0) {
        const diffText = diffs.map((d) =>
          `### ${d.filename}\n\`\`\`${d.language}\n${d.newContent}\n\`\`\``
        ).join('\n\n');
        parts.push(`## Current Diffs\n${diffText}`);
      }
    } else {
      // File path — include its content
      const file = editorStore.tabs.find((t) => t.path === mention);
      if (file?.content) {
        parts.push(`## File: ${file.path}\n\`\`\`${file.language}\n${file.content}\n\`\`\``);
      }
    }
  }

  return parts.join('\n\n');
}
