'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
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

interface CommandItem {
  id: string;
  label: string;
  description?: string;
  icon: LucideIcon;
  category: 'navigation' | 'workspace' | 'actions' | 'settings';
  shortcut?: string;
  action: () => void;
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

  const filteredCommands = query.trim()
    ? commands.filter(
        (cmd) =>
          cmd.label.toLowerCase().includes(query.toLowerCase()) ||
          (cmd.description?.toLowerCase().includes(query.toLowerCase()) ?? false) ||
          cmd.category.toLowerCase().includes(query.toLowerCase())
      )
    : commands;

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
        setSelectedIndex((prev) => Math.min(prev + 1, filteredCommands.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = filteredCommands[selectedIndex];
        if (cmd) executeCommand(cmd);
      } else if (e.key === 'Escape') {
        toggleCommandPalette();
        setQuery('');
        setSelectedIndex(0);
      }
    },
    [filteredCommands, selectedIndex, executeCommand, toggleCommandPalette]
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
  for (const cmd of filteredCommands) {
    if (!grouped[cmd.category]) grouped[cmd.category] = [];
    grouped[cmd.category].push(cmd);
  }

  const CATEGORY_LABELS: Record<string, string> = {
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
            placeholder="Type a command..."
            className="w-full bg-transparent font-ui text-sm text-pablo-text outline-none placeholder:text-pablo-text-muted"
          />
        </div>

        {/* Command list */}
        <div ref={listRef} className="max-h-72 overflow-y-auto p-1">
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
                    <span className="flex-1 font-ui text-xs">{cmd.label}</span>
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

          {filteredCommands.length === 0 && (
            <div className="flex flex-col items-center gap-2 py-6 text-center">
              <Search size={20} className="text-pablo-text-muted" />
              <p className="font-ui text-xs text-pablo-text-muted">No commands found</p>
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
