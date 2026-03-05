'use client';

/**
 * PipelineDeploySection — Deploy button + status display for completed pipeline runs.
 * Extracted from RunCard in PipelineView.tsx (Task 28).
 */

import { useState } from 'react';
import {
  Loader2,
  CheckCircle2,
  Rocket,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { useEditorStore } from '@/stores/editor';
import { parseGeneratedFiles } from '@/lib/code-parser';
import type { PipelineRun } from '@/stores/pipeline';

export function PipelineDeploySection({ run }: { run: PipelineRun }) {
  const [deployState, setDeployState] = useState<'idle' | 'deploying' | 'deployed' | 'error'>('idle');
  const [deployUrl, setDeployUrl] = useState<string | null>(null);
  const [deployError, setDeployError] = useState<string | null>(null);

  // Only show when pipeline has completed stages with output
  const hasCompletedOutput =
    (run.status === 'completed' || run.status === 'failed') &&
    run.stages.some((s) => s.status === 'completed' && s.output);

  if (!hasCompletedOutput) return null;

  const handleDeploy = async () => {
    setDeployState('deploying');
    setDeployError(null);
    try {
      // Extract all generated code from completed stages
      const allOutput = run.stages
        .filter((s) => s.output && s.status === 'completed')
        .map((s) => s.output)
        .join('\n\n');
      let parsedFiles = parseGeneratedFiles(allOutput);

      // Fall back to editor tabs if code parser couldn't extract files
      if (parsedFiles.length === 0) {
        const editorTabs = useEditorStore.getState().tabs;
        parsedFiles = editorTabs
          .filter((t) => t.content && t.content.trim().length > 0)
          .map((t) => ({ filename: t.path, language: t.language || 'plaintext', content: t.content }));
      }

      if (parsedFiles.length === 0) {
        throw new Error('No code files found in pipeline output');
      }

      // Generate a project name from the feature description
      const projectName = run.featureDescription
        .slice(0, 40)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '') || 'pablo-deploy';

      const res = await fetch('/api/deploy/cloudflare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: parsedFiles.map((f) => ({ path: f.filename, content: f.content })),
          project_name: projectName,
        }),
      });

      const data = await res.json() as { success?: boolean; production_url?: string; deployment_url?: string; error?: string };

      if (!res.ok || !data.success) {
        throw new Error(data.error ?? 'Deploy failed');
      }

      const url = data.production_url ?? data.deployment_url ?? null;
      if (!url) {
        throw new Error('Deploy succeeded but no URL was returned');
      }
      setDeployUrl(url);
      setDeployState('deployed');
    } catch (err) {
      setDeployError(err instanceof Error ? err.message : 'Deploy failed');
      setDeployState('error');
    }
  };

  return (
    <div className="border-t border-pablo-border px-3 py-2">
      {deployState === 'idle' && (
        <button
          onClick={handleDeploy}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-pablo-green/20 px-4 py-2 font-ui text-xs font-medium text-pablo-green transition-colors hover:bg-pablo-green/30"
        >
          <Rocket size={14} />
          Deploy to Cloudflare Pages
        </button>
      )}
      {deployState === 'deploying' && (
        <div className="flex items-center justify-center gap-2 py-2">
          <Loader2 size={14} className="animate-spin text-pablo-gold" />
          <span className="font-ui text-xs text-pablo-gold">Deploying to Cloudflare Pages...</span>
        </div>
      )}
      {deployState === 'deployed' && deployUrl && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} className="text-pablo-green" />
            <span className="font-ui text-xs font-medium text-pablo-green">Deployed successfully!</span>
          </div>
          <a
            href={deployUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 rounded-md bg-pablo-active px-3 py-1.5 font-code text-[11px] text-pablo-gold hover:bg-pablo-hover transition-colors"
          >
            <ExternalLink size={12} />
            {deployUrl}
          </a>
        </div>
      )}
      {deployState === 'error' && (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-pablo-red" />
            <span className="font-ui text-xs text-pablo-red">{deployError}</span>
          </div>
          <button
            onClick={() => setDeployState('idle')}
            className="font-ui text-[10px] text-pablo-text-muted hover:text-pablo-text underline"
          >
            Try again
          </button>
        </div>
      )}
    </div>
  );
}
