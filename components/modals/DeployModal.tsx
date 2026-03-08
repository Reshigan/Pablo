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

// Phase 4.1: Docker helpers
function generateDockerfile(files: Array<{ path: string; content: string }>): string {
  const hasPackageJson = files.some(f => f.path === 'package.json');
  const hasPython = files.some(f => f.path.endsWith('.py'));

  if (hasPackageJson) {
    return `FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app ./
EXPOSE 3000
CMD ["npm", "start"]`;
  } else if (hasPython) {
    return `FROM python:3.12-slim
WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]`;
  }

  return `FROM nginx:alpine
COPY . /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]`;
}

function generateDockerCompose(projectName: string): string {
  return `version: '3.8'
services:
  ${projectName}:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
    restart: unless-stopped`;
}

interface DeployModalProps {
  open: boolean;
  onClose: () => void;
}

export function DeployModal({ open, onClose }: DeployModalProps) {
  const [selectedTarget, setSelectedTarget] = useState<DeployTarget | null>(null);
  const [projectName, setProjectName] = useState('');
  const [deploying, setDeploying] = useState(false);
  const [result, setResult] = useState<{ url?: string; error?: string } | null>(null);

  const tabs = useEditorStore((s) => s.tabs);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);

  if (!open) return null;

  const handleDeploy = async () => {
    if (!selectedTarget) return;
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
        // Deploy to GitHub repo (Cloudflare Pages connects via GitHub integration)
        const repoName = selectedRepo?.full_name;
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files,
            project_name: name,
            ...(repoName ? { repo: repoName, branch: 'main' } : {}),
          }),
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          const errMsg = errData.error || `Deploy failed with status ${res.status}`;
          // Provide actionable guidance for common errors
          if (res.status === 401) {
            throw new Error('Not authenticated. Please sign in with GitHub first.');
          } else if (errMsg.includes('already exists')) {
            throw new Error(`Repository "${name}" already exists. Try a different project name.`);
          }
          throw new Error(errMsg);
        }

        const data = (await res.json()) as { url?: string; repo?: string; message?: string };
        const url = data.url || (data.repo ? `https://github.com/${data.repo}` : undefined);

        addDeployEntry({
          id: `deploy-${Date.now()}`,
          status: 'live',
          url: url || '',
          projectName: name,
          timestamp: Date.now(),
          log: data.message,
        });

        setResult({ url: url || undefined });
      } else if (selectedTarget === 'vercel' || selectedTarget === 'netlify') {
        // Deploy via GitHub — Vercel/Netlify connect via GitHub integration
        const repoName = selectedRepo?.full_name;
        const res = await fetch('/api/deploy', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            files,
            project_name: name,
            ...(repoName ? { repo: repoName, branch: 'main' } : {}),
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          const errMsg = errData.error || `${selectedTarget} deploy failed: ${res.status}`;
          if (res.status === 401) throw new Error('Not authenticated. Please sign in with GitHub first.');
          if (errMsg.includes('already exists')) throw new Error(`Repository "${name}" already exists. Try a different project name.`);
          throw new Error(errMsg);
        }
        const data = (await res.json()) as { url?: string; repo?: string; message?: string };
        const url = data.url || (data.repo ? `https://github.com/${data.repo}` : undefined);
        addDeployEntry({ id: `deploy-${Date.now()}`, status: 'live', url: url || '', projectName: name, timestamp: Date.now(), log: data.message });
        setResult({ url: url || undefined });
      } else if (selectedTarget === 'github-pages') {
        // Phase 4.1: GitHub Pages — commit to gh-pages branch
        if (!selectedRepo) {
          throw new Error('Select a GitHub repo first to deploy to GitHub Pages');
        }
        const res = await fetch('/api/github/commit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            repo: selectedRepo.full_name,
            branch: 'gh-pages',
            message: `Deploy to GitHub Pages — ${files.length} file(s)`,
            files,
          }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(errData.error || `GitHub Pages deploy failed: ${res.status}`);
        }
        const [owner, repo] = selectedRepo.full_name.split('/');
        const url = `https://${owner}.github.io/${repo}`;
        addDeployEntry({ id: `deploy-${Date.now()}`, status: 'live', url, projectName: name, timestamp: Date.now() });
        setResult({ url });
      } else if (selectedTarget === 'docker') {
        // Phase 4.1: Docker — generate Dockerfile and docker-compose.yml
        const dockerfile = generateDockerfile(files);
        const compose = generateDockerCompose(name);
        // If repo connected, commit Docker files
        if (selectedRepo) {
          const res = await fetch('/api/github/commit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              repo: selectedRepo.full_name,
              branch: 'main',
              message: `Add Dockerfile and docker-compose.yml for ${name}`,
              files: [{ path: 'Dockerfile', content: dockerfile }, { path: 'docker-compose.yml', content: compose }],
            }),
          });
          if (res.ok) {
            addDeployEntry({ id: `deploy-${Date.now()}`, status: 'live', url: `${selectedRepo.html_url}`, projectName: name, timestamp: Date.now() });
            setResult({ url: `${selectedRepo.html_url}` });
          } else {
            throw new Error('Failed to commit Docker files to repo');
          }
        } else {
          // Download Docker files
          const blob = new Blob([`# Dockerfile\n${dockerfile}\n\n# docker-compose.yml\n${compose}`], { type: 'text/plain' });
          const a = document.createElement('a');
          a.href = URL.createObjectURL(blob);
          a.download = `${name}-docker.txt`;
          a.click();
          setResult({ url: undefined, error: undefined });
          addDeployEntry({ id: `deploy-${Date.now()}`, status: 'live', url: 'local-download', projectName: name, timestamp: Date.now() });
        }
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
              const isAvailable = true; // Phase 4.1: All targets now supported
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
          disabled={deploying || !selectedTarget}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-pablo-gold py-2 font-ui text-sm font-semibold text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-50"
        >
          {deploying ? (
            <>
              <Loader2 size={14} className="animate-spin" />
              Deploying...
            </>
          ) : !selectedTarget ? (
            <>
              <Rocket size={14} />
              Select a deploy target
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
