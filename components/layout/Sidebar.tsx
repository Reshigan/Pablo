'use client';

import {
  Files,
  Search,
  GitBranch,
  Brain,
  BarChart3,
  Plug,
  FolderPlus,
  MessageSquare,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type SidebarTab } from '@/stores/ui';

interface SidebarTabConfig {
  id: SidebarTab;
  icon: LucideIcon;
  label: string;
}

const tabs: SidebarTabConfig[] = [
  { id: 'files', icon: Files, label: 'File Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'memory', icon: Brain, label: 'Self-Learning' },
  { id: 'metrics', icon: BarChart3, label: 'Metrics' },
  { id: 'mcp', icon: Plug, label: 'MCP Servers' },
];

function SidebarTabIcon({ tab, isActive, onClick }: { tab: SidebarTabConfig; isActive: boolean; onClick: () => void }) {
  const TabIcon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={`relative flex h-10 w-full items-center justify-center transition-colors duration-150 hover:bg-pablo-hover ${
        isActive ? 'text-pablo-text' : 'text-pablo-text-muted hover:text-pablo-text-dim'
      }`}
      aria-label={tab.label}
      title={tab.label}
    >
      {isActive && (
        <div className="absolute left-0 top-1 bottom-1 w-[3px] rounded-r bg-pablo-gold" />
      )}
      <TabIcon size={20} />
    </button>
  );
}

function FileExplorerPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <FolderPlus size={32} className="text-pablo-text-muted" />
      <p className="font-ui text-xs text-pablo-text-muted">
        Clone a repository to get started
      </p>
      <button className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim">
        Connect Repo
      </button>
    </div>
  );
}

function SearchPlaceholder() {
  return (
    <div className="p-3">
      <div className="flex items-center rounded-md bg-pablo-input px-3 py-2">
        <Search size={14} className="mr-2 text-pablo-text-muted" />
        <input
          type="text"
          placeholder="Search codebase..."
          className="w-full bg-transparent font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted"
        />
      </div>
      <div className="mt-6 flex flex-col items-center gap-2 text-center">
        <Search size={24} className="text-pablo-text-muted" />
        <p className="font-ui text-xs text-pablo-text-muted">
          Search across your codebase
        </p>
      </div>
    </div>
  );
}

function GitPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <GitBranch size={32} className="text-pablo-text-muted" />
      <p className="font-ui text-xs text-pablo-text-muted">
        No changes detected
      </p>
    </div>
  );
}

function MemoryPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <Brain size={32} className="text-pablo-text-muted" />
      <p className="font-ui text-xs text-pablo-text-muted">
        Pablo learns from your sessions. Start building to see patterns here.
      </p>
    </div>
  );
}

function MetricsPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <BarChart3 size={32} className="text-pablo-text-muted" />
      <p className="font-ui text-xs text-pablo-text-muted">
        Complete your first feature to see metrics.
      </p>
    </div>
  );
}

function MCPPlaceholder() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <Plug size={32} className="text-pablo-text-muted" />
      <p className="font-ui text-xs text-pablo-text-muted">
        Connect external tools via MCP
      </p>
      <button className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim">
        Add Server
      </button>
    </div>
  );
}

const panelComponents: Record<SidebarTab, React.ComponentType> = {
  files: FileExplorerPlaceholder,
  search: SearchPlaceholder,
  git: GitPlaceholder,
  memory: MemoryPlaceholder,
  metrics: MetricsPlaceholder,
  mcp: MCPPlaceholder,
};

export function Sidebar() {
  const { sidebarOpen, sidebarTab, setSidebarTab, sidebarWidth } = useUIStore();
  const ActivePanel = panelComponents[sidebarTab];

  return (
    <aside
      className="flex h-full shrink-0 border-r border-pablo-border bg-pablo-panel"
      style={{ width: sidebarOpen ? sidebarWidth : 48 }}
      role="complementary"
      aria-label="Sidebar"
    >
      {/* Icon strip - always visible */}
      <div className="flex w-12 shrink-0 flex-col border-r border-pablo-border bg-pablo-panel pt-1">
        {tabs.map((tab) => (
          <SidebarTabIcon
            key={tab.id}
            tab={tab}
            isActive={sidebarTab === tab.id}
            onClick={() => setSidebarTab(tab.id)}
          />
        ))}
      </div>

      {/* Panel content - visible when sidebar is expanded */}
      {sidebarOpen && (
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {/* Panel header */}
          <div className="flex h-9 shrink-0 items-center px-3 font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-dim">
            {tabs.find((t) => t.id === sidebarTab)?.label}
          </div>

          {/* Panel content */}
          <div className="flex-1 overflow-y-auto">
            <ActivePanel />
          </div>
        </div>
      )}
    </aside>
  );
}

/* Empty state for chat */
export function ChatEmptyState() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
      <MessageSquare size={32} className="text-pablo-text-muted" />
      <p className="font-ui text-sm text-pablo-text-dim">
        Start by describing what you want to build
      </p>
      <div className="flex flex-col gap-2 w-full max-w-xs">
        {['Build a REST API for users', 'Create a dashboard with charts', 'Fix the auth middleware'].map((prompt) => (
          <button
            key={prompt}
            className="rounded-lg border border-pablo-border bg-pablo-hover px-3 py-2 text-left font-ui text-xs text-pablo-text-dim transition-colors duration-150 hover:border-pablo-border-hov hover:text-pablo-text"
          >
            {prompt}
          </button>
        ))}
      </div>
    </div>
  );
}
