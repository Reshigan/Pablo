'use client';

import {
  GitBranch,
  GitCommit,
  GitPullRequest,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Loader2,
  ExternalLink,
  Clock,
  User,
} from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useRepoStore } from '@/stores/repo';
import { toast } from '@/stores/toast';

interface CommitData {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
}

export function GitPanel() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectedBranch = useRepoStore((s) => s.selectedBranch);
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [loading, setLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(true);

  const loadCommits = useCallback(async () => {
    if (!selectedRepo) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        repo: selectedRepo.full_name,
        sha: selectedBranch,
        per_page: '20',
      });
      const response = await fetch(`/api/github/commits?${params.toString()}`);
      if (!response.ok) throw new Error(`Failed: ${response.status}`);
      const data = (await response.json()) as CommitData[];
      setCommits(data);
    } catch {
      toast('Failed to load commits', 'Could not fetch commit history.');
    } finally {
      setLoading(false);
    }
  }, [selectedRepo, selectedBranch]);

  useEffect(() => {
    if (selectedRepo) loadCommits();
  }, [selectedRepo, loadCommits]);

  const handleCreatePR = useCallback(() => {
    if (!selectedRepo) {
      toast('Select a repository first');
      return;
    }
    window.open(`${selectedRepo.html_url}/compare`, '_blank');
  }, [selectedRepo]);

  const handleViewHistory = useCallback(() => {
    if (!selectedRepo) {
      toast('Select a repository first');
      return;
    }
    window.open(`${selectedRepo.html_url}/commits/${selectedBranch}`, '_blank');
  }, [selectedRepo, selectedBranch]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 30) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  if (!selectedRepo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <GitBranch size={24} className="text-pablo-text-muted" />
        <p className="font-ui text-xs text-pablo-text-muted">
          Select a repository to view git info
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Branch info */}
      <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-2">
        <GitBranch size={14} className="shrink-0 text-pablo-gold" />
        <span className="font-ui text-xs text-pablo-text">{selectedBranch}</span>
        <button
          onClick={loadCommits}
          disabled={loading}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim disabled:opacity-30"
          aria-label="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Commit history */}
      <div>
        <button
          onClick={() => setShowHistory(!showHistory)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {showHistory ? (
            <ChevronDown size={12} className="text-pablo-text-muted" />
          ) : (
            <ChevronRight size={12} className="text-pablo-text-muted" />
          )}
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">
            Recent Commits
          </span>
          <span className="ml-auto rounded bg-pablo-gold/10 px-1.5 font-ui text-[10px] text-pablo-gold">
            {commits.length}
          </span>
        </button>

        {loading && commits.length === 0 && (
          <div className="flex items-center justify-center py-4">
            <Loader2 size={16} className="animate-spin text-pablo-gold" />
          </div>
        )}

        {showHistory && commits.map((commit) => (
          <button
            key={commit.sha}
            onClick={() => window.open(commit.html_url, '_blank')}
            className="flex w-full items-start gap-2 border-b border-pablo-border/50 px-3 py-1.5 text-left transition-colors hover:bg-pablo-hover"
          >
            <GitCommit size={12} className="mt-0.5 shrink-0 text-pablo-text-muted" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-ui text-[11px] text-pablo-text-dim">
                {commit.commit.message.split('\n')[0]}
              </p>
              <div className="mt-0.5 flex items-center gap-2">
                <span className="flex items-center gap-0.5 font-ui text-[9px] text-pablo-text-muted">
                  <User size={8} />
                  {commit.commit.author.name}
                </span>
                <span className="flex items-center gap-0.5 font-ui text-[9px] text-pablo-text-muted">
                  <Clock size={8} />
                  {formatDate(commit.commit.author.date)}
                </span>
                <span className="font-code text-[9px] text-pablo-text-muted">
                  {commit.sha.slice(0, 7)}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Quick actions */}
      <div className="mt-2 flex flex-col gap-1 border-t border-pablo-border px-2 pt-2">
        <button
          onClick={handleCreatePR}
          className="flex items-center gap-2 rounded px-2 py-1 text-left font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
        >
          <GitPullRequest size={14} />
          Create Pull Request
          <ExternalLink size={10} className="ml-auto" />
        </button>
        <button
          onClick={handleViewHistory}
          className="flex items-center gap-2 rounded px-2 py-1 text-left font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
        >
          <GitCommit size={14} />
          View Full History
          <ExternalLink size={10} className="ml-auto" />
        </button>
      </div>
    </div>
  );
}
