'use client';

/**
 * v7 Part 6: Multiple deploy targets — DeployModal
 * Supports 5 deploy targets: Cloudflare Pages, Vercel, Netlify, GitHub Pages, Docker.
 */

import { useState } from 'react';
import { X, Rocket, Globe, Cloud, Github, Container, CheckCircle2, Loader2, ExternalLink } from 'lucide-react';
import { useEditorStore } from '@/stores/editor';
import { useRepoStore } from '@/stores/repo';
import { addDeployEntry } from '@/components/workspace/DeployLogs';

export type DeployTarget = 'cloudflare-pages' | 'vercel' | 'netlify' | 'github-pages' | 'docker';

interface DeployTargetConfig {
  id: DeployTarget;
  label: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const DEPLOY_TARGETS: DeployTargetConfig[] = [
  { id: 'cloudflare-pages', label: 'Cloudflare Pages', description: 'Edge deployment with global CDN', icon: Cloud },
  { id: 'vercel', label: 'Vercel', description: 'Zero-config Next.js hosting', icon: Globe },
  { id: 'netlify', label: 'Netlify', description: 'Git-based continuous deployment', icon: Globe },
  { id: 'github-pages', label: 'GitHub Pages', description: 'Free static site hosting', icon: Github },
  { id: 'docker', label: 'Docker', description: 'Container-based deployment', icon: Container },
];

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
}

export function DeployModal({ open, onClose }: DeployModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<DeployTarget>('cloudflare-pages');
  const [projectName, setProjectName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);

  const tabs = useEditorStore((s) => s.tabs);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  if (!open) return null;

  const handleDeploy = async () => {
    setDeploying(true);
    setResult(null);

    const name = projectName.trim() || selectedRepo?.name || `pablo-${Date.now()}`;

    try {
      // Collect files from editor tabs
      const files = tabs
        .filter((t) => t.content && t.path)
        .map((t) => ({ path: t.path!, content: t.content! }));

      if (files.length === 0) {
        setResult({ error: 'No files to deploy. Open files in the editor first.' });
        setDeploying(false);
        return;
      }

      if (selectedTarget === 'cloudflare-pages') {
        // Use existing Cloudflare Pages deploy API
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ files, project_name: name }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `Deploy failed: ${res.status}`);
        }

        const data = (await res.json()) as { url?: string; project_name?: string };
        const url = data.url || `https://${name}.pages.dev`;

        addDeployEntry({
          id: `deploy-${Date.now()}`,
          status: 'live',
          url,
          projectName: name,
          timestamp: Date.now(),
        });

        setResult({ url });
      } else {
        // Other targets — show coming soon with instructions
        const instructions: Record<DeployTarget, string> = {
          'cloudflare-pages': '',
          'vercel': 'Push to GitHub and connect via vercel.com',
          'netlify': 'Push to GitHub and connect via netlify.com',
          'github-pages': 'Enable GitHub Pages in repo settings',
          'docker': 'Generate Dockerfile and build with docker build',
        };

        setResult({
          error: `${DEPLOY_TARGETS.find((t) => t.id === selectedTarget)?.label} deployment coming soon. ${instructions[selectedTarget]}`,
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Deploy failed';
      addDeployEntry({
        id: `deploy-${Date.now()}`,
        status: 'failed',
        url: '',
        projectName: name,
        timestamp: Date.now(),
        log: msg,
      });
      setResult({ error: msg });
    } finally {
      setDeploying(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-md rounded-xl border border-pablo-border bg-pablo-panel p-5 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="mb-4 flex items-center gap-2">
          <Rocket size={18} className="text-pablo-gold" />
          <h2 className="font-ui text-base font-bold text-pablo-text">Deploy Project</h2>
        </div>

        {/* Project name */}
        <div className="mb-4">
          <label className="mb-1 block font-ui text-[10px] font-medium uppercase tracking-wider text-pablo-text-muted">
            Project Name
          </label>
          <input
            type="text"
            value={projectName}
            onChange={(e) => setProjectName(e.target.value)}
            placeholder={selectedRepo?.name || 'my-project'}
            className="w-full rounded-md border border-pablo-border bg-pablo-input px-3 py-1.5 font-ui text-sm text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          />
        </div>

        {/* Target selector */}
        <div className="mb-4">
          <label className="mb-2 block font-ui text-[10px] font-medium uppercase tracking-wider text-pablo-text-muted">
            Deploy Target
          </label>
          <div className="space-y-1.5">
            {DEPLOY_TARGETS.map((target) => {
              const Icon = target.icon;
              const isSelected = selectedTarget === target.id;
              const isAvailable = target.id === 'cloudflare-pages';
              return (
                <button
                  key={target.id}
                  onClick={() => setSelectedTarget(target.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-all ${
                    isSelected
                      ? 'border-pablo-gold/50 bg-pablo-gold/5'
                      : 'border-pablo-border bg-pablo-bg hover:border-pablo-border hover:bg-pablo-hover'
                  }`}
                >
                  <Icon size={16} className={isSelected ? 'text-pablo-gold' : 'text-pablo-text-muted'} />
                  <div className="flex-1">
                    <span className={`font-ui text-xs font-medium ${isSelected ? 'text-pablo-gold' : 'text-pablo-text-dim'}`}>
                      {target.label}
                    </span>
                    <p className="font-ui text-[10px] text-pablo-text-muted">{target.description}</p>
                  </div>
                  {!isAvailable && (
                    <span className="rounded bg-pablo-hover px-1.5 py-0.5 font-ui text-[9px] text-pablo-text-muted">
                      Soon
                    </span>
                  )}
                  {isSelected && <CheckCircle2 size={14} className="text-pablo-gold" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* Result */}
        {result && (
          <div className={`mb-4 rounded-lg p-3 ${result.error ? 'bg-pablo-red/10 border border-pablo-red/20' : 'bg-pablo-green/10 border border-pablo-green/20'}`}>
            {result.url ? (
              <a
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 font-ui text-sm text-pablo-green hover:underline"
              >
                <ExternalLink size={14} />
                {result.url}
              </a>
            ) : (
              <p className="font-ui text-xs text-pablo-red">{result.error}</p>
            )}
          </div>
        )}

        {/* Deploy button */}
        <button
          onClick={handleDeploy}
          disabled={deploying}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-pablo-gold py-2 font-ui text-sm font-semibold text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-50"
        >
          {deploying ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Deploying...
            </>
          ) : (
            <>
              <Rocket size={14} />
              Deploy to {DEPLOY_TARGETS.find((t) => t.id === selectedTarget)?.label}
            </>
          )}
        </button>
      </div>
    </div>
  );
}
