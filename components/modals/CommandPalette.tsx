'use client';

import { useEffect, useMemo, useState, useCallback, useRef } from 'react';
import {
  Search,
  File,
  Settings,
  Terminal,
  MessageSquare,
  GitBranch,
  Play,
  Database,
  Globe,
  Brain,
  BarChart3,
  Plug,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type SidebarTab, type WorkspaceTab } from '@/stores/ui';
import { useRepoStore } from '@/stores/repo';
import { useEditorStore } from '@/stores/editor';

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  category: 'files' | 'navigation' | 'workspace' | 'actions' | 'settings';
  shortcut?: string;
  action: () => void;
}

interface GitTreeResponse {
  tree?: Array<{ path?: string; type?: string }>;
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

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    dockerfile: 'dockerfile',
    xml: 'xml',
    svg: 'xml',
    graphql: 'graphql',
    prisma: 'prisma',
  };
  return langMap[ext] ?? 'plaintext';
}

async function fetchFileContent(repo: string, path: string, ref: string): Promise<string> {
  const params = new URLSearchParams({ repo, path, ref });
  const response = await fetch(`/api/github/contents?${params.toString()}`);
  if (!response.ok) throw new Error(`Failed to fetch file: ${response.status}`);
  const data = (await response.json()) as GitHubContentItem;
  if (data.content && data.encoding === 'base64') return atob(data.content);
  return data.content ?? '';
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    toggleCommandPalette,
    setSidebarTab,
    setActiveWorkspaceTab,
    toggleTerminal,
    toggleChat,
    toggleSettings,
    toggleSidebar,
  } = useUIStore();

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectedBranch = useRepoStore((s) => s.selectedBranch);
  const openFile = useEditorStore((s) => s.openFile);
  const openTabs = useEditorStore((s) => s.tabs);

  const [repoFileIndex, setRepoFileIndex] = useState<string[]>([]);
  const [repoIndexLoading, setRepoIndexLoading] = useState(false);
  const [repoIndexError, setRepoIndexError] = useState<string | null>(null);

  // If the repo changes, discard any cached index
  useEffect(() => {
    setRepoFileIndex([]);
  }, [selectedRepo?.full_name]);

  const commands: CommandItem[] = [
    // Navigation
    { id: 'nav-files', label: 'File Explorer', icon: File, category: 'navigation', shortcut: 'Ctrl+Shift+E', action: () => setSidebarTab('files' as SidebarTab) },
    { id: 'nav-search', label: 'Search', icon: Search, category: 'navigation', shortcut: 'Ctrl+Shift+F', action: () => setSidebarTab('search' as SidebarTab) },
    { id: 'nav-git', label: 'Source Control', icon: GitBranch, category: 'navigation', shortcut: 'Ctrl+Shift+G', action: () => setSidebarTab('git' as SidebarTab) },
    { id: 'nav-memory', label: 'Self-Learning', icon: Brain, category: 'navigation', action: () => setSidebarTab('memory' as SidebarTab) },
    { id: 'nav-metrics', label: 'Metrics', icon: BarChart3, category: 'navigation', action: () => setSidebarTab('metrics' as SidebarTab) },
    { id: 'nav-mcp', label: 'MCP Servers', icon: Plug, category: 'navigation', action: () => setSidebarTab('mcp' as SidebarTab) },

    // Workspace
    { id: 'ws-editor', label: 'Code Editor', icon: File, category: 'workspace', action: () => setActiveWorkspaceTab('editor' as WorkspaceTab) },
    { id: 'ws-diff', label: 'Diff Viewer', icon: GitBranch, category: 'workspace', action: () => setActiveWorkspaceTab('diff' as WorkspaceTab) },
    { id: 'ws-db', label: 'Database Designer', icon: Database, category: 'workspace', action: () => setActiveWorkspaceTab('db-designer' as WorkspaceTab) },
    { id: 'ws-api', label: 'API Tester', icon: Globe, category: 'workspace', action: () => setActiveWorkspaceTab('api-tester' as WorkspaceTab) },
    { id: 'ws-preview', label: 'Live Preview', icon: Globe, category: 'workspace', action: () => setActiveWorkspaceTab('preview' as WorkspaceTab) },

    // Actions
    { id: 'act-terminal', label: 'Toggle Terminal', icon: Terminal, category: 'actions', shortcut: 'Ctrl+`', action: () => toggleTerminal() },
    { id: 'act-chat', label: 'Toggle Chat', icon: MessageSquare, category: 'actions', shortcut: 'Ctrl+Shift+C', action: () => toggleChat() },
    { id: 'act-sidebar', label: 'Toggle Sidebar', icon: File, category: 'actions', shortcut: 'Ctrl+B', action: () => toggleSidebar() },
    { id: 'act-pipeline', label: 'Start Feature Pipeline', icon: Play, category: 'actions', action: () => setActiveWorkspaceTab('editor' as WorkspaceTab) },

    // Settings
    { id: 'set-settings', label: 'Open Settings', icon: Settings, category: 'settings', shortcut: 'Ctrl+,', action: () => toggleSettings() },
  ];

  const isCommandMode = query.trim().startsWith('>');
  const effectiveQuery = isCommandMode ? query.trim().slice(1).trim() : query.trim();

  // Build (or reuse) a full repo file index for quick-open
  useEffect(() => {
    let cancelled = false;

    async function loadIndex() {
      if (!commandPaletteOpen || !selectedRepo) return;
      if (repoFileIndex.length > 0 || repoIndexLoading) return;

      setRepoIndexLoading(true);
      setRepoIndexError(null);
      try {
        const params = new URLSearchParams({
          repo: selectedRepo.full_name,
          branch: selectedBranch,
          recursive: 'true',
        });
        const res = await fetch(`/api/github/tree?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as GitTreeResponse;
        const files = (data.tree ?? [])
          .filter((n) => n.type === 'blob' && typeof n.path === 'string')
          .map((n) => n.path as string);
        if (!cancelled) setRepoFileIndex(files);
      } catch (e) {
        if (!cancelled) setRepoIndexError(e instanceof Error ? e.message : 'Failed to index repo');
      } finally {
        if (!cancelled) setRepoIndexLoading(false);
      }
    }

    loadIndex();

    return () => {
      cancelled = true;
    };
  }, [commandPaletteOpen, selectedRepo, selectedBranch, repoFileIndex.length, repoIndexLoading]);

  const filteredCommands = useMemo(() => {
    if (!effectiveQuery) return commands;
    const q = effectiveQuery.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(q) ||
        (cmd.description?.toLowerCase().includes(q) ?? false) ||
        cmd.category.toLowerCase().includes(q)
    );
  }, [commands, effectiveQuery]);

  const fileItems: CommandItem[] = useMemo(() => {
    if (isCommandMode) return [];
    if (!effectiveQuery) return [];

    const q = effectiveQuery.toLowerCase();

    // If no repo is connected, fall back to searching open tabs
    if (!selectedRepo) {
      return openTabs
        .filter((t) => t.path.toLowerCase().includes(q) || t.name.toLowerCase().includes(q))
        .slice(0, 10)
        .map((t) => ({
          id: `file:tab:${t.path}`,
          label: t.name,
          description: t.path,
          icon: File,
          category: 'files',
          action: () => {
            useEditorStore.getState().setActiveTab(t.id);
            setActiveWorkspaceTab('editor' as WorkspaceTab);
          },
        }));
    }

    // Repo connected — use indexed file list
    const matches = repoFileIndex
      .filter((p) => p.toLowerCase().includes(q))
      .slice(0, 12);

    return matches.map((path) => {
      const name = path.split('/').pop() ?? path;
      return {
        id: `file:${path}`,
        label: name,
        description: path,
        icon: File,
        category: 'files',
        action: async () => {
          try {
            setActiveWorkspaceTab('editor' as WorkspaceTab);
            const content = await fetchFileContent(selectedRepo.full_name, path, selectedBranch);
            openFile({
              id: `${selectedRepo.full_name}:${path}`,
              path,
              name,
              language: detectLanguage(name),
              content,
            });
          } catch {
            openFile({
              id: `${selectedRepo.full_name}:${path}`,
              path,
              name,
              language: detectLanguage(name),
              content: `// Error: Could not load ${path}`,
            });
          }
        },
      };
    });
  }, [effectiveQuery, isCommandMode, openTabs, openFile, repoFileIndex, selectedRepo, selectedBranch, setActiveWorkspaceTab]);

  const filteredItems = useMemo(() => {
    // ">" mode = commands-only
    if (isCommandMode) return filteredCommands;
    return [...fileItems, ...filteredCommands];
  }, [fileItems, filteredCommands, isCommandMode]);

  const executeCommand = useCallback(
    (cmd: CommandItem) => {
      cmd.action();
      toggleCommandPalette();
      setQuery('');
      setSelectedIndex(0);
    },
    [toggleCommandPalette]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.min(prev + 1, filteredItems.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredItems[selectedIndex];
        if (cmd) executeCommand(cmd);
      } else if (e.key === 'Escape') {
        toggleCommandPalette();
        setQuery('');
        setSelectedIndex(0);
      }
    },
    [filteredItems, selectedIndex, executeCommand, toggleCommandPalette]
  );

  useEffect(() => {
    if (commandPaletteOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [commandPaletteOpen]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const items = listRef.current.querySelectorAll('[data-command-item]');
      const selectedItem = items[selectedIndex];
      if (selectedItem) {
        selectedItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!commandPaletteOpen) return null;

  // Group by category
  const grouped: Record<string, CommandItem[]> = {};
  for (const cmd of filteredItems) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }

  const CATEGORY_LABELS: Record<string, string> = {
    files: 'Files',
    navigation: 'Navigation',
    workspace: 'Workspace',
    actions: 'Actions',
    settings: 'Settings',
  };

  let globalIndex = -1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => {
        toggleCommandPalette();
        setQuery('');
      }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Palette */}
      <div
        className="relative w-full max-w-lg rounded-xl border border-pablo-border bg-pablo-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center border-b border-pablo-border px-3 py-2">
          <Search size={16} className="mr-2 shrink-0 text-pablo-text-muted" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a file name, or > for commands..."
            className="w-full bg-transparent font-ui text-sm text-pablo-text outline-none placeholder:text-pablo-text-muted"
          />
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
          {!isCommandMode && effectiveQuery && selectedRepo && repoIndexError && (
            <div className="px-2 py-1">
              <span className="font-ui text-[10px] text-pablo-red">
                Repo index failed ({repoIndexError}) — showing commands only
              </span>
            </div>
          )}
          {!isCommandMode && effectiveQuery && selectedRepo && repoIndexLoading && repoFileIndex.length === 0 && (
            <div className="px-2 py-1">
              <span className="font-ui text-[10px] text-pablo-text-muted">Indexing repo files...</span>
            </div>
          )}
          {Object.entries(grouped).map(([category, cmds]) => (
            <div key={category}>
              <div className="px-2 py-1">
                <span className="font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
                  {CATEGORY_LABELS[category] ?? category}
                </span>
              </div>
              {cmds.map((cmd) => {
                globalIndex += 1;
                const isSelected = globalIndex === selectedIndex;
                const Icon = cmd.icon;
                const currentIndex = globalIndex;
                return (
                  <button
                    key={cmd.id}
                    data-command-item
                    onClick={() => executeCommand(cmd)}
                    onMouseEnter={() => setSelectedIndex(currentIndex)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                      isSelected ? 'bg-pablo-hover text-pablo-text' : 'text-pablo-text-dim hover:bg-pablo-hover'
                    }`}
                  >
                    <Icon size={14} className="shrink-0 text-pablo-text-muted" />
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="font-ui text-xs">{cmd.label}</span>
                      {cmd.description && (
                        <span className="font-ui text-[10px] text-pablo-text-muted truncate">{cmd.description}</span>
                      )}
                    </div>
                    {cmd.shortcut && (
                      <kbd className="shrink-0 rounded border border-pablo-border bg-pablo-active px-1.5 py-0.5 font-code text-[9px] text-pablo-text-muted">
                        {cmd.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}

          {filteredItems.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Search size={20} className="text-pablo-text-muted" />
              <p className="font-ui text-xs text-pablo-text-muted">No matches found</p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-3 border-t border-pablo-border px-3 py-1.5">
          <span className="font-ui text-[10px] text-pablo-text-muted">
            <kbd className="rounded border border-pablo-border px-1 text-[9px]">↑↓</kbd> navigate
          </span>
          <span className="font-ui text-[10px] text-pablo-text-muted">
            <kbd className="rounded border border-pablo-border px-1 text-[9px]">↵</kbd> select
          </span>
          <span className="font-ui text-[10px] text-pablo-text-muted">
            <kbd className="rounded border border-pablo-border px-1 text-[9px]">esc</kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}
