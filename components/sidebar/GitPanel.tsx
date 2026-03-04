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
  Upload,
  Save,
  Plus,
  Rocket,
  FolderPlus,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { useState, useCallback, useEffect } from 'react';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';
import { toast } from '@/stores/toast';
import { useActivityStore } from '@/stores/activity';

interface CommitData {
  sha: string;
  commit: {
    message: string;
    author: { name: string; date: string };
  };
  html_url: string;
}

interface BranchData {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export function GitPanel() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectedBranch = useRepoStore((s) => s.selectedBranch);
  const setSelectedBranch = useRepoStore((s) => s.setSelectedBranch);
  const tabs = useEditorStore((s) => s.tabs);
  const [commits, setCommits] = useState<CommitData[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [showHistory, setShowHistory] = useState(true);
  const [showCommitForm, setShowCommitForm] = useState(true);
  const [showPRForm, setShowPRForm] = useState(false);
  const [showBranches, setShowBranches] = useState(false);
  const [showCreateRepo, setShowCreateRepo] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);

  // PR form state
  const [prTitle, setPrTitle] = useState('');
  const [prBase, setPrBase] = useState('main');
  const [prBody, setPrBody] = useState('');
  const [creatingPR, setCreatingPR] = useState(false);

  // Branch state
  const [branches, setBranches] = useState<BranchData[]>([]);
  const [loadingBranches, setLoadingBranches] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [creatingBranch, setCreatingBranch] = useState(false);

  // Create repo state
  const [newRepoName, setNewRepoName] = useState('');
  const [newRepoDesc, setNewRepoDesc] = useState('');
  const [newRepoPrivate, setNewRepoPrivate] = useState(false);
  const [creatingRepo, setCreatingRepo] = useState(false);

  // Deploy state
  const [deploying, setDeploying] = useState(false);
  const [deployProjectName, setDeployProjectName] = useState('');

  // AI Review state (Feature 19)
  const [showAIReview, setShowAIReview] = useState(false);
  const [aiReviewing, setAiReviewing] = useState(false);
  const [aiReviewResult, setAiReviewResult] = useState<string | null>(null);

  const dirtyTabs = tabs.filter((t) => t.isDirty);

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

  const loadBranches = useCallback(async () => {
    if (!selectedRepo) return;
    setLoadingBranches(true);
    try {
      const res = await fetch(`/api/github/branch?repo=${encodeURIComponent(selectedRepo.full_name)}`);
      if (!res.ok) throw new Error(`Failed: ${res.status}`);
      const data = (await res.json()) as BranchData[];
      setBranches(data);
    } catch {
      toast('Failed to load branches');
    } finally {
      setLoadingBranches(false);
    }
  }, [selectedRepo]);

  useEffect(() => {
    if (selectedRepo) loadCommits();
  }, [selectedRepo, loadCommits]);

  const handleCommitAndPush = useCallback(async () => {
    if (!selectedRepo || !commitMessage.trim()) return;
    const filesToCommit = tabs.filter((t) => t.isDirty && t.content && t.path);
    if (filesToCommit.length === 0) {
      toast('No files to commit', 'Open some files first.');
      return;
    }

    setCommitting(true);
    try {
      const response = await fetch('/api/github/commit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: selectedRepo.full_name,
          branch: selectedBranch,
          message: commitMessage.trim(),
          files: filesToCommit.map((t) => ({ path: t.path, content: t.content })),
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { sha: string; url: string };
      toast('Committed successfully', `${filesToCommit.length} file(s) pushed — ${data.sha.slice(0, 7)}`);

      // Mark all committed files as clean
      const editorStore = useEditorStore.getState();
      for (const tab of filesToCommit) {
        editorStore.markClean(tab.id);
      }

      setCommitMessage('');
      loadCommits();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast('Commit failed', msg);
    } finally {
      setCommitting(false);
    }
  }, [selectedRepo, selectedBranch, commitMessage, tabs, loadCommits]);

  const handleCreatePR = useCallback(async () => {
    if (!selectedRepo || !prTitle.trim()) return;
    setCreatingPR(true);
    try {
      const response = await fetch('/api/github/pull-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: selectedRepo.full_name,
          title: prTitle.trim(),
          head: selectedBranch,
          base: prBase,
          body: prBody,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { number: number; url: string };
      toast('PR created!', `#${data.number} — ${prTitle.trim()}`);
      window.open(data.url, '_blank');
      setPrTitle('');
      setPrBody('');
      setShowPRForm(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast('PR creation failed', msg);
    } finally {
      setCreatingPR(false);
    }
  }, [selectedRepo, selectedBranch, prTitle, prBase, prBody]);

  const handleCreateBranch = useCallback(async () => {
    if (!selectedRepo || !newBranchName.trim()) return;
    setCreatingBranch(true);
    try {
      const response = await fetch('/api/github/branch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo: selectedRepo.full_name,
          branch: newBranchName.trim(),
          from_branch: selectedBranch,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${response.status}`);
      }

      toast('Branch created', `${newBranchName.trim()} from ${selectedBranch}`);
      setNewBranchName('');
      setSelectedBranch(newBranchName.trim());
      loadBranches();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast('Branch creation failed', msg);
    } finally {
      setCreatingBranch(false);
    }
  }, [selectedRepo, selectedBranch, newBranchName, setSelectedBranch, loadBranches]);

  const handleCreateRepo = useCallback(async () => {
    if (!newRepoName.trim()) return;
    setCreatingRepo(true);
    try {
      const response = await fetch('/api/github/create-repo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newRepoName.trim(),
          description: newRepoDesc,
          private: newRepoPrivate,
          auto_init: true,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { full_name: string; url: string };
      toast('Repository created!', data.full_name);
      window.open(data.url, '_blank');
      setNewRepoName('');
      setNewRepoDesc('');
      setShowCreateRepo(false);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast('Repo creation failed', msg);
    } finally {
      setCreatingRepo(false);
    }
  }, [newRepoName, newRepoDesc, newRepoPrivate]);

  const handleDeploy = useCallback(async () => {
    if (!selectedRepo) return;
    const filesToDeploy = tabs.filter((t) => t.content && t.path);
    if (filesToDeploy.length === 0) {
      toast('No files to deploy', 'Open some files first.');
      return;
    }

    setDeploying(true);
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesToDeploy.map((t) => ({ path: t.path, content: t.content })),
          repo: selectedRepo.full_name,
          branch: selectedBranch,
          project_name: deployProjectName || undefined,
        }),
      });

      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${response.status}`);
      }

      const data = (await response.json()) as { message: string; url: string; sha: string };
      toast('Deployed!', data.message);
      if (data.url) window.open(data.url, '_blank');
      setShowDeploy(false);
      setDeployProjectName('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      toast('Deploy failed', msg);
    } finally {
      setDeploying(false);
    }
  }, [selectedRepo, selectedBranch, tabs, deployProjectName]);

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
      <div className="flex h-full flex-col">
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <GitBranch size={24} className="text-pablo-text-muted" />
          <p className="font-ui text-xs text-pablo-text-muted">
            Select a repository to view git info
          </p>
        </div>

        {/* Create new repo (available even without repo selected) */}
        <div className="mt-auto border-t border-pablo-border">
          <button
            onClick={() => setShowCreateRepo(!showCreateRepo)}
            className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
          >
            {showCreateRepo ? <ChevronDown size={12} className="text-pablo-text-muted" /> : <ChevronRight size={12} className="text-pablo-text-muted" />}
            <FolderPlus size={12} className="text-pablo-gold" />
            <span className="font-ui text-[11px] font-medium text-pablo-text-dim">Create New Repository</span>
          </button>
          {showCreateRepo && (
            <div className="border-t border-pablo-border/50 px-3 py-2">
              <input
                type="text"
                value={newRepoName}
                onChange={(e) => setNewRepoName(e.target.value)}
                placeholder="Repository name..."
                className="mb-1.5 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
              />
              <input
                type="text"
                value={newRepoDesc}
                onChange={(e) => setNewRepoDesc(e.target.value)}
                placeholder="Description (optional)..."
                className="mb-1.5 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
              />
              <label className="mb-1.5 flex items-center gap-2 font-ui text-[10px] text-pablo-text-muted">
                <input type="checkbox" checked={newRepoPrivate} onChange={(e) => setNewRepoPrivate(e.target.checked)} className="rounded" />
                Private repository
              </label>
              <button
                onClick={handleCreateRepo}
                disabled={creatingRepo || !newRepoName.trim()}
                className="flex w-full items-center justify-center gap-1.5 rounded bg-pablo-gold px-3 py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
              >
                {creatingRepo ? <Loader2 size={12} className="animate-spin" /> : <FolderPlus size={12} />}
                {creatingRepo ? 'Creating...' : 'Create Repository'}
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      {/* Branch info + switcher */}
      <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-2 shrink-0">
        <GitBranch size={14} className="shrink-0 text-pablo-gold" />
        <button
          onClick={() => { setShowBranches(!showBranches); if (!showBranches) loadBranches(); }}
          className="flex items-center gap-1 font-ui text-xs text-pablo-text hover:text-pablo-gold transition-colors"
        >
          {selectedBranch}
          <ChevronDown size={10} />
        </button>
        <button
          onClick={loadCommits}
          disabled={loading}
          className="ml-auto flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim disabled:opacity-30"
          aria-label="Refresh"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Branch dropdown */}
      {showBranches && (
        <div className="border-b border-pablo-border bg-pablo-panel shrink-0">
          {loadingBranches ? (
            <div className="flex items-center justify-center py-3">
              <Loader2 size={14} className="animate-spin text-pablo-gold" />
            </div>
          ) : (
            <div className="max-h-32 overflow-y-auto">
              {branches.map((b) => (
                <button
                  key={b.name}
                  onClick={() => { setSelectedBranch(b.name); setShowBranches(false); }}
                  className={`flex w-full items-center gap-2 px-3 py-1 text-left font-ui text-xs transition-colors hover:bg-pablo-hover ${b.name === selectedBranch ? 'text-pablo-gold bg-pablo-gold/5' : 'text-pablo-text-dim'}`}
                >
                  <GitBranch size={10} />
                  {b.name}
                  {b.protected && <span className="ml-auto font-ui text-[9px] text-pablo-text-muted">protected</span>}
                </button>
              ))}
            </div>
          )}
          <div className="flex items-center gap-1 border-t border-pablo-border/50 px-2 py-1.5">
            <input
              type="text"
              value={newBranchName}
              onChange={(e) => setNewBranchName(e.target.value)}
              placeholder="New branch name..."
              className="flex-1 rounded border border-pablo-border bg-pablo-input px-2 py-0.5 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreateBranch(); }}
            />
            <button
              onClick={handleCreateBranch}
              disabled={creatingBranch || !newBranchName.trim()}
              className="flex h-5 items-center gap-1 rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20 disabled:opacity-30"
            >
              {creatingBranch ? <Loader2 size={10} className="animate-spin" /> : <Plus size={10} />}
              Create
            </button>
          </div>
        </div>
      )}

      {/* Commit & Push — always visible at top */}
      <div className="border-b border-pablo-border shrink-0">
        <button
          onClick={() => setShowCommitForm(!showCommitForm)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {showCommitForm ? (
            <ChevronDown size={12} className="text-pablo-text-muted" />
          ) : (
            <ChevronRight size={12} className="text-pablo-text-muted" />
          )}
          <Upload size={12} className="text-pablo-gold" />
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">
            Commit & Push
          </span>
          {dirtyTabs.length > 0 && (
            <span className="ml-auto rounded bg-pablo-gold/10 px-1.5 font-ui text-[10px] text-pablo-gold">
              {dirtyTabs.length} modified
            </span>
          )}
        </button>

        {showCommitForm && (
          <div className="border-t border-pablo-border/50 px-3 py-2">
            <p className="mb-1.5 font-ui text-[10px] text-pablo-text-muted">
              {dirtyTabs.length} file(s) will be committed to <span className="text-pablo-gold">{selectedBranch}</span>
            </p>
            <input
              type="text"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleCommitAndPush();
                }
              }}
              placeholder="Commit message..."
              className="w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <button
              onClick={handleCommitAndPush}
              disabled={committing || !commitMessage.trim()}
              className="mt-1.5 flex w-full items-center justify-center gap-1.5 rounded bg-pablo-gold px-3 py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {committing ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
              {committing ? 'Pushing...' : 'Commit & Push'}
            </button>
          </div>
        )}
      </div>

      {/* Create Pull Request */}
      <div className="border-b border-pablo-border shrink-0">
        <button
          onClick={() => setShowPRForm(!showPRForm)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {showPRForm ? <ChevronDown size={12} className="text-pablo-text-muted" /> : <ChevronRight size={12} className="text-pablo-text-muted" />}
          <GitPullRequest size={12} className="text-pablo-green" />
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">Create Pull Request</span>
        </button>
        {showPRForm && (
          <div className="border-t border-pablo-border/50 px-3 py-2">
            <p className="mb-1.5 font-ui text-[10px] text-pablo-text-muted">
              From <span className="text-pablo-gold">{selectedBranch}</span> into <span className="text-pablo-green">{prBase}</span>
            </p>
            <input
              type="text"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="PR title..."
              className="mb-1 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <input
              type="text"
              value={prBase}
              onChange={(e) => setPrBase(e.target.value)}
              placeholder="Base branch (default: main)..."
              className="mb-1 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <textarea
              value={prBody}
              onChange={(e) => setPrBody(e.target.value)}
              placeholder="Description (optional)..."
              rows={2}
              className="mb-1.5 w-full resize-none rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <button
              onClick={handleCreatePR}
              disabled={creatingPR || !prTitle.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-pablo-green/90 px-3 py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-green disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {creatingPR ? <Loader2 size={12} className="animate-spin" /> : <GitPullRequest size={12} />}
              {creatingPR ? 'Creating...' : 'Create Pull Request'}
            </button>
          </div>
        )}
      </div>

      {/* Deploy */}
      <div className="border-b border-pablo-border shrink-0">
        <button
          onClick={() => setShowDeploy(!showDeploy)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {showDeploy ? <ChevronDown size={12} className="text-pablo-text-muted" /> : <ChevronRight size={12} className="text-pablo-text-muted" />}
          <Rocket size={12} className="text-pablo-blue" />
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">Deploy / Publish</span>
        </button>
        {showDeploy && (
          <div className="border-t border-pablo-border/50 px-3 py-2">
            <p className="mb-1.5 font-ui text-[10px] text-pablo-text-muted">
              Deploy {tabs.filter(t => t.content && t.path).length} open file(s) to GitHub repo
            </p>
            <input
              type="text"
              value={deployProjectName}
              onChange={(e) => setDeployProjectName(e.target.value)}
              placeholder="Project name (optional)..."
              className="mb-1.5 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <button
              onClick={handleDeploy}
              disabled={deploying || tabs.filter(t => t.content && t.path).length === 0}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-pablo-blue/90 px-3 py-1 font-ui text-xs font-medium text-white transition-colors hover:bg-pablo-blue disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {deploying ? <Loader2 size={12} className="animate-spin" /> : <Rocket size={12} />}
              {deploying ? 'Deploying...' : 'Deploy to GitHub'}
            </button>
          </div>
        )}
      </div>

      {/* Create New Repository */}
      <div className="border-b border-pablo-border shrink-0">
        <button
          onClick={() => setShowCreateRepo(!showCreateRepo)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {showCreateRepo ? <ChevronDown size={12} className="text-pablo-text-muted" /> : <ChevronRight size={12} className="text-pablo-text-muted" />}
          <FolderPlus size={12} className="text-pablo-orange" />
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">Create New Repository</span>
        </button>
        {showCreateRepo && (
          <div className="border-t border-pablo-border/50 px-3 py-2">
            <input
              type="text"
              value={newRepoName}
              onChange={(e) => setNewRepoName(e.target.value)}
              placeholder="Repository name..."
              className="mb-1 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <input
              type="text"
              value={newRepoDesc}
              onChange={(e) => setNewRepoDesc(e.target.value)}
              placeholder="Description (optional)..."
              className="mb-1 w-full rounded border border-pablo-border bg-pablo-input px-2 py-1 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
            />
            <label className="mb-1.5 flex items-center gap-2 font-ui text-[10px] text-pablo-text-muted">
              <input type="checkbox" checked={newRepoPrivate} onChange={(e) => setNewRepoPrivate(e.target.checked)} className="rounded" />
              Private repository
            </label>
            <button
              onClick={handleCreateRepo}
              disabled={creatingRepo || !newRepoName.trim()}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-pablo-orange/90 px-3 py-1 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-orange disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {creatingRepo ? <Loader2 size={12} className="animate-spin" /> : <FolderPlus size={12} />}
              {creatingRepo ? 'Creating...' : 'Create Repository'}
            </button>
          </div>
        )}
      </div>

      {/* Commit history */}
      <div className="shrink-0">
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

        {showHistory && (
          <div className="max-h-48 overflow-y-auto">
            {commits.map((commit) => (
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
        )}
      </div>

      {/* Feature 19: AI Diff Review */}
      <div className="border-b border-pablo-border shrink-0">
        <button
          onClick={() => setShowAIReview(!showAIReview)}
          className="flex w-full items-center gap-1 px-2 py-1.5 text-left transition-colors hover:bg-pablo-hover"
        >
          {showAIReview ? <ChevronDown size={12} className="text-pablo-text-muted" /> : <ChevronRight size={12} className="text-pablo-text-muted" />}
          <Sparkles size={12} className="text-purple-400" />
          <span className="font-ui text-[11px] font-medium text-pablo-text-dim">AI Code Review</span>
        </button>
        {showAIReview && (
          <div className="border-t border-pablo-border/50 px-3 py-2">
            <p className="mb-1.5 font-ui text-[10px] text-pablo-text-muted">
              AI will review your modified files and suggest improvements
            </p>
            <button
              onClick={async () => {
                const filesToReview = tabs.filter(t => t.isDirty && t.content);
                if (filesToReview.length === 0) {
                  toast('No changes', 'No modified files to review.');
                  return;
                }
                setAiReviewing(true);
                setAiReviewResult(null);
                try {
                  const codeContext = filesToReview
                    .map(f => `--- ${f.path} ---\n${f.content.slice(0, 2000)}`)
                    .join('\n\n');
                  const res = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      messages: [{
                        role: 'user',
                        content: `Review these code changes and suggest improvements. Focus on bugs, security issues, and best practices. Be concise.\n\n${codeContext}`,
                      }],
                    }),
                  });
                  if (!res.ok) throw new Error('Review failed');
                  const reader = res.body?.getReader();
                  if (!reader) throw new Error('No response body');
                  let result = '';
                  const decoder = new TextDecoder();
                  while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    const chunk = decoder.decode(value, { stream: true });
                    for (const line of chunk.split('\n')) {
                      if (line.startsWith('data: ') && line !== 'data: [DONE]') {
                        try {
                          const parsed = JSON.parse(line.slice(6)) as { choices?: Array<{ delta?: { content?: string } }> };
                          const content = parsed.choices?.[0]?.delta?.content;
                          if (content) result += content;
                        } catch { /* skip */ }
                      }
                    }
                  }
                  setAiReviewResult(result || 'No issues found.');
                  useActivityStore.getState().addEntry('ai_review', `AI reviewed ${filesToReview.length} file(s)`);
                } catch {
                  setAiReviewResult('Review failed — API may be unavailable.');
                } finally {
                  setAiReviewing(false);
                }
              }}
              disabled={aiReviewing || dirtyTabs.length === 0}
              className="flex w-full items-center justify-center gap-1.5 rounded bg-purple-500/20 px-3 py-1 font-ui text-xs font-medium text-purple-300 transition-colors hover:bg-purple-500/30 disabled:opacity-30 disabled:cursor-not-allowed"
            >
              {aiReviewing ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} />}
              {aiReviewing ? 'Reviewing...' : `Review ${dirtyTabs.length} file(s)`}
            </button>
            {aiReviewResult && (
              <div className="mt-2 max-h-40 overflow-y-auto rounded bg-pablo-bg px-2 py-1.5">
                <pre className="whitespace-pre-wrap font-code text-[10px] text-pablo-text-dim leading-relaxed">
                  {aiReviewResult}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-col gap-1 border-t border-pablo-border px-2 pt-2 pb-2 shrink-0">
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
