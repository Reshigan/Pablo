'use client';

import {
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  ChevronRight,
  ChevronDown,
  RefreshCw,
  GitBranch,
  Lock,
  Globe,
  Search,
  ArrowLeft,
  Loader2,
  Star,
  AlertCircle,
  Files,
} from 'lucide-react';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useEditorStore } from '@/stores/editor';
import { useRepoStore, type GitHubRepo, type RepoFileNode } from '@/stores/repo';
import { useUIStore } from '@/stores/ui';
import { toast } from '@/stores/toast';

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-pablo-blue';
    case 'js':
    case 'jsx':
      return 'text-yellow-400';
    case 'css':
    case 'scss':
      return 'text-pablo-purple';
    case 'json':
      return 'text-pablo-green';
    case 'md':
      return 'text-pablo-text-dim';
    case 'py':
      return 'text-pablo-blue';
    case 'rs':
      return 'text-pablo-orange';
    case 'go':
      return 'text-pablo-blue';
    default:
      return 'text-pablo-text-muted';
  }
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript', tsx: 'typescriptreact', js: 'javascript', jsx: 'javascriptreact',
    json: 'json', md: 'markdown', css: 'css', scss: 'scss', html: 'html',
    py: 'python', rs: 'rust', go: 'go', sql: 'sql', yaml: 'yaml', yml: 'yaml',
    toml: 'toml', sh: 'shell', bash: 'shell', dockerfile: 'dockerfile',
    xml: 'xml', svg: 'xml', graphql: 'graphql', prisma: 'prisma',
  };
  return langMap[ext] ?? 'plaintext';
}

interface GitHubContentItem {
  name: string;
  path: string;
  type: string;
  sha: string;
  size: number;
  content?: string;
  encoding?: string;
}

async function fetchDirectoryContents(repo: string, path: string, ref: string): Promise<RepoFileNode[]> {
  const params = new URLSearchParams({ repo, path, ref });
  const response = await fetch(`/api/github/contents?${params.toString()}`);
  if (!response.ok) throw new Error(`Failed to fetch contents: ${response.status}`);
  const data = (await response.json()) as GitHubContentItem[];
  if (!Array.isArray(data)) return [];
  return data
    .map((item) => ({
      name: item.name,
      path: item.path,
      type: (item.type === 'dir' ? 'dir' : 'file') as 'dir' | 'file',
      sha: item.sha,
      size: item.size,
      children: item.type === 'dir' ? [] : undefined,
      isLoaded: false,
      isLoading: false,
    }))
    .sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'dir' ? -1 : 1;
    });
}

async function fetchFileContent(repo: string, path: string, ref: string): Promise<string> {
  const params = new URLSearchParams({ repo, path, ref });
  const response = await fetch(`/api/github/contents?${params.toString()}`);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  const data = (await response.json()) as GitHubContentItem;
  if (data.content && data.encoding === 'base64') return atob(data.content);
  return data.content ?? '';
}

function TreeNode({ node, depth, repo, branch }: {
  node: RepoFileNode; depth: number; repo: string; branch: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const openFile = useEditorStore((s) => s.openFile);
  const updateNodeChildren = useRepoStore((s) => s.updateNodeChildren);
  const setNodeLoading = useRepoStore((s) => s.setNodeLoading);

  const handleClick = useCallback(async () => {
    if (node.type === 'dir') {
      if (!expanded && !node.isLoaded) {
        setNodeLoading(node.path, true);
        try {
          const children = await fetchDirectoryContents(repo, node.path, branch);
          updateNodeChildren(node.path, children);
        } catch {
          setNodeLoading(node.path, false);
        }
      }
      setExpanded((prev) => !prev);
    } else {
      setLoadingFile(true);
      try {
        const content = await fetchFileContent(repo, node.path, branch);
        openFile({
          id: `${repo}:${node.path}`,
          path: node.path,
          name: node.name,
          language: detectLanguage(node.name),
          content,
        });
      } catch {
        openFile({
          id: `${repo}:${node.path}`,
          path: node.path,
          name: node.name,
          language: detectLanguage(node.name),
          content: `// Error: Could not load ${node.path}`,
        });
      } finally {
        setLoadingFile(false);
      }
    }
  }, [node, expanded, repo, branch, openFile, updateNodeChildren, setNodeLoading]);

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1 px-1 py-[3px] text-left transition-colors duration-100 hover:bg-pablo-hover"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'dir' ? (
          <>
            {node.isLoading ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-pablo-gold" />
            ) : expanded ? (
              <ChevronDown size={14} className="shrink-0 text-pablo-text-muted" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-pablo-text-muted" />
            )}
            {expanded ? (
              <FolderOpen size={14} className="shrink-0 text-pablo-gold" />
            ) : (
              <Folder size={14} className="shrink-0 text-pablo-gold-dim" />
            )}
          </>
        ) : (
          <>
            {loadingFile ? (
              <Loader2 size={14} className="shrink-0 animate-spin text-pablo-text-muted" />
            ) : (
              <span className="w-3.5 shrink-0" />
            )}
            <File size={14} className={`shrink-0 ${getFileIcon(node.name)}`} />
          </>
        )}
        <span className="truncate font-ui text-xs text-pablo-text">{node.name}</span>
        {node.type === 'file' && node.size > 0 && (
          <span className="ml-auto shrink-0 font-ui text-[9px] text-pablo-text-muted">
            {node.size > 1024 ? `${(node.size / 1024).toFixed(1)}K` : `${node.size}B`}
          </span>
        )}
      </button>
      {node.type === 'dir' && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} repo={repo} branch={branch} />
          ))}
          {node.children.length === 0 && node.isLoaded && (
            <div className="font-ui text-[10px] text-pablo-text-muted italic"
              style={{ paddingLeft: `${(depth + 1) * 12 + 8}px` }}>
              Empty directory
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RepoSelector() {
  const {
    repos, reposLoading, reposError,
    setRepos, setReposLoading, setReposError,
    selectRepo, setFileTree, setFileTreeLoading, setFileTreeError,
  } = useRepoStore();
  const [searchQuery, setSearchQuery] = useState('');

  const loadRepos = useCallback(async () => {
    setReposLoading(true);
    setReposError(null);
    try {
      const response = await fetch('/api/github/repos?per_page=100&sort=updated');
      if (!response.ok) {
        if (response.status === 401) throw new Error('Not authenticated. Please sign in with GitHub.');
        throw new Error(`Failed to load repos: ${response.status}`);
      }
      const data = (await response.json()) as GitHubRepo[];
      setRepos(data);
    } catch (err) {
      setReposError(err instanceof Error ? err.message : 'Failed to load repos');
    } finally {
      setReposLoading(false);
    }
  }, [setRepos, setReposLoading, setReposError]);

  useEffect(() => {
    if (repos.length === 0 && !reposLoading && !reposError) loadRepos();
  }, [repos.length, reposLoading, reposError, loadRepos]);

  const handleSelectRepo = useCallback(async (repo: GitHubRepo) => {
    selectRepo(repo);
    setFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const tree = await fetchDirectoryContents(repo.full_name, '', repo.default_branch);
      setFileTree(tree);
    } catch (err) {
      setFileTreeError(err instanceof Error ? err.message : 'Failed to load file tree');
    } finally {
      setFileTreeLoading(false);
    }
  }, [selectRepo, setFileTree, setFileTreeLoading, setFileTreeError]);

  const filteredRepos = repos.filter((r) =>
    r.full_name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (reposLoading && repos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <Loader2 size={24} className="animate-spin text-pablo-gold" />
        <p className="font-ui text-xs text-pablo-text-muted">Loading repositories...</p>
      </div>
    );
  }

  if (reposError) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <AlertCircle size={24} className="text-pablo-red" />
        <p className="font-ui text-xs text-pablo-red">{reposError}</p>
        <button onClick={loadRepos}
          className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim">
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="p-2">
        <div className="flex items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-1 focus-within:border-pablo-gold/50">
          <Search size={12} className="mr-1.5 shrink-0 text-pablo-text-muted" />
          <input type="text" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search repositories..."
            className="w-full bg-transparent font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted" />
        </div>
      </div>
      <div className="max-h-[calc(100vh-200px)] overflow-y-auto">
        {filteredRepos.map((repo) => (
          <button key={repo.id} onClick={() => handleSelectRepo(repo)}
            className="flex w-full items-start gap-2 border-b border-pablo-border/50 px-3 py-2 text-left transition-colors duration-100 hover:bg-pablo-hover">
            <div className="mt-0.5 shrink-0">
              {repo.private ? <Lock size={14} className="text-pablo-orange" /> : <Globe size={14} className="text-pablo-text-muted" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <span className="truncate font-ui text-xs font-medium text-pablo-text">{repo.name}</span>
              {repo.description && (
                <span className="line-clamp-1 font-ui text-[10px] text-pablo-text-muted">{repo.description}</span>
              )}
              <div className="flex items-center gap-2">
                {repo.language && <span className="font-ui text-[10px] text-pablo-text-dim">{repo.language}</span>}
                <span className="flex items-center gap-0.5 font-ui text-[10px] text-pablo-text-muted">
                  <Star size={9} />{repo.stargazers_count}
                </span>
                <span className="flex items-center gap-0.5 font-ui text-[10px] text-pablo-text-muted">
                  <GitBranch size={9} />{repo.default_branch}
                </span>
              </div>
            </div>
          </button>
        ))}
        {filteredRepos.length === 0 && (
          <div className="px-4 py-6 text-center">
            <p className="font-ui text-xs text-pablo-text-muted">No repositories found</p>
          </div>
        )}
      </div>
    </div>
  );
}

function NewFileButton({ repo, branch, onCreated }: { repo: string; branch: string; onCreated: () => void }) {
  const [showInput, setShowInput] = useState(false);
  const [fileName, setFileName] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  const handleCreate = useCallback(async () => {
    if (!fileName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/github/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo,
          path: fileName.trim(),
          content: '',
          message: `Create ${fileName.trim()}`,
          branch,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast('File created', fileName.trim());
      setFileName('');
      setShowInput(false);
      onCreated();
    } catch (err) {
      toast('Failed to create file', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [repo, branch, fileName, onCreated]);

  if (showInput) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={fileName}
          onChange={(e) => setFileName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowInput(false); }}
          placeholder="path/to/file.ts"
          className="w-24 rounded border border-pablo-border bg-pablo-input px-1.5 py-0.5 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
        />
        {creating ? <Loader2 size={12} className="animate-spin text-pablo-gold" /> : (
          <button onClick={handleCreate} disabled={!fileName.trim()} className="text-pablo-green hover:text-pablo-green/80 disabled:opacity-30">
            <FilePlus size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowInput(true)}
      className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim"
      aria-label="New file"
      title="Create new file"
    >
      <FilePlus size={14} />
    </button>
  );
}

function NewFolderButton({ repo, branch, onCreated }: { repo: string; branch: string; onCreated: () => void }) {
  const [showInput, setShowInput] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showInput && inputRef.current) inputRef.current.focus();
  }, [showInput]);

  const handleCreate = useCallback(async () => {
    if (!folderName.trim()) return;
    setCreating(true);
    try {
      // GitHub API doesn't support empty directories — create a .gitkeep file
      const path = `${folderName.trim().replace(/\/$/, '')}/.gitkeep`;
      const res = await fetch('/api/github/file', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          repo,
          path,
          content: '',
          message: `Create ${folderName.trim()}/`,
          branch,
        }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        throw new Error(err.error ?? `HTTP ${res.status}`);
      }
      toast('Folder created', folderName.trim());
      setFolderName('');
      setShowInput(false);
      onCreated();
    } catch (err) {
      toast('Failed to create folder', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setCreating(false);
    }
  }, [repo, branch, folderName, onCreated]);

  if (showInput) {
    return (
      <div className="flex items-center gap-1">
        <input
          ref={inputRef}
          type="text"
          value={folderName}
          onChange={(e) => setFolderName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowInput(false); }}
          placeholder="folder/name"
          className="w-24 rounded border border-pablo-border bg-pablo-input px-1.5 py-0.5 font-ui text-[10px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
        />
        {creating ? <Loader2 size={12} className="animate-spin text-pablo-gold" /> : (
          <button onClick={handleCreate} disabled={!folderName.trim()} className="text-pablo-green hover:text-pablo-green/80 disabled:opacity-30">
            <FolderPlus size={12} />
          </button>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => setShowInput(true)}
      className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim"
      aria-label="New folder"
      title="Create new folder"
    >
      <FolderPlus size={14} />
    </button>
  );
}

export function FileExplorer() {
  const {
    selectedRepo, fileTree, fileTreeLoading, fileTreeError,
    clearRepo, setFileTree, setFileTreeLoading, setFileTreeError, selectedBranch,
  } = useRepoStore();

  const handleRefresh = useCallback(async () => {
    if (!selectedRepo) return;
    setFileTreeLoading(true);
    setFileTreeError(null);
    try {
      const tree = await fetchDirectoryContents(selectedRepo.full_name, '', selectedBranch);
      setFileTree(tree);
    } catch (err) {
      setFileTreeError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setFileTreeLoading(false);
    }
  }, [selectedRepo, selectedBranch, setFileTree, setFileTreeLoading, setFileTreeError]);

  // Issue 12: Actionable empty state when no repo selected
  if (!selectedRepo) {
    const editorTabs = useEditorStore.getState().tabs;
    if (editorTabs.length === 0) {
      return (
        <div className="flex flex-col items-center gap-3 px-4 py-8 text-center">
          <Files size={24} className="text-pablo-text-muted" />
          <p className="font-ui text-xs text-pablo-text-muted">No files yet</p>
          <p className="font-ui text-[10px] text-pablo-text-muted leading-relaxed max-w-[200px]">
            Files will appear here after you run the Build pipeline, or you can connect a GitHub repo.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => useUIStore.getState().setActiveWorkspaceTab('pipeline')}
              className="rounded-lg bg-pablo-gold/10 px-3 py-1.5 font-ui text-[10px] text-pablo-gold hover:bg-pablo-gold/20 transition-colors"
            >
              Build something
            </button>
            <button
              onClick={() => useUIStore.getState().setSidebarTab('git')}
              className="rounded-lg bg-pablo-surface-2 px-3 py-1.5 font-ui text-[10px] text-pablo-text-dim hover:bg-pablo-hover transition-colors"
            >
              Open a repo
            </button>
          </div>
        </div>
      );
    }
    return <RepoSelector />;
  }

  return (
    <div className="flex flex-col">
      {/* Repo header */}
      <div className="flex items-center gap-1.5 border-b border-pablo-border px-2 py-1.5">
        <button onClick={clearRepo}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim"
          aria-label="Back to repos" title="Back to repos">
          <ArrowLeft size={14} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate font-ui text-xs font-medium text-pablo-text">{selectedRepo.name}</span>
          <span className="flex items-center gap-1 font-ui text-[10px] text-pablo-text-muted">
            <GitBranch size={9} />{selectedBranch}
          </span>
        </div>
        <button onClick={handleRefresh} disabled={fileTreeLoading}
          className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim disabled:opacity-30"
          aria-label="Refresh">
          <RefreshCw size={12} className={fileTreeLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 border-b border-pablo-border px-2 py-1">
        <NewFileButton repo={selectedRepo.full_name} branch={selectedBranch} onCreated={handleRefresh} />
        <NewFolderButton repo={selectedRepo.full_name} branch={selectedBranch} onCreated={handleRefresh} />
      </div>

      {/* Loading state */}
      {fileTreeLoading && fileTree.length === 0 && (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <Loader2 size={24} className="animate-spin text-pablo-gold" />
          <p className="font-ui text-xs text-pablo-text-muted">Loading file tree...</p>
        </div>
      )}

      {/* Error state */}
      {fileTreeError && (
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-6 text-center">
          <AlertCircle size={20} className="text-pablo-red" />
          <p className="font-ui text-xs text-pablo-red">{fileTreeError}</p>
          <button onClick={handleRefresh}
            className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim">
            Retry
          </button>
        </div>
      )}

      {/* File tree */}
      {fileTree.length > 0 && (
        <div className="overflow-y-auto py-1">
          {fileTree.map((node) => (
            <TreeNode key={node.path} node={node} depth={0} repo={selectedRepo.full_name} branch={selectedBranch} />
          ))}
        </div>
      )}
    </div>
  );
}
