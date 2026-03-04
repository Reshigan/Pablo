'use client';

import {
  Files,
  Search,
  GitBranch,
  Brain,
  BarChart3,
  Plug,
  LayoutList,
  Activity,
  History,
  Flag,
  KeyRound,
  BookOpen,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type SidebarTab } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';
import { FileExplorer } from '@/components/sidebar/FileExplorer';
import { SearchPanel } from '@/components/sidebar/SearchPanel';
import { GitPanel } from '@/components/sidebar/GitPanel';
import { MemoryPanel } from '@/components/sidebar/MemoryPanel';
import { MetricsPanel } from '@/components/sidebar/MetricsPanel';
import { MCPPanel } from '@/components/sidebar/MCPPanel';
import { SessionsPanel } from '@/components/sidebar/SessionsPanel';
import { ActivityPanel } from '@/components/sidebar/ActivityPanel';
import { PromptHistoryPanel } from '@/components/sidebar/PromptHistoryPanel';
import { CheckpointPanel } from '@/components/sidebar/CheckpointPanel';
import { SecretsPanel } from '@/components/sidebar/SecretsPanel';

interface SidebarTabConfig {
  id: SidebarTab;
  icon: LucideIcon;
  label: string;
  group: 'core' | 'ai' | 'project';
}

// Issue 10: Reordered by frequency, grouped into Core/AI/Project
const tabs: SidebarTabConfig[] = [
  // Core
  { id: 'files', icon: Files, label: 'File Explorer', group: 'core' },
  { id: 'search', icon: Search, label: 'Search', group: 'core' },
  { id: 'git', icon: GitBranch, label: 'Source Control', group: 'core' },
  // AI
  { id: 'memory', icon: Brain, label: 'Self-Learning', group: 'ai' },
  { id: 'sessions', icon: LayoutList, label: 'Sessions', group: 'ai' },
  { id: 'history', icon: BookOpen, label: 'Prompt History', group: 'ai' },
  // Project
  { id: 'checkpoints', icon: Flag, label: 'Checkpoints', group: 'project' },
  { id: 'activity', icon: Activity, label: 'Activity', group: 'project' },
  { id: 'secrets', icon: KeyRound, label: 'Secrets', group: 'project' },
  { id: 'metrics', icon: BarChart3, label: 'Metrics', group: 'project' },
  { id: 'mcp', icon: Plug, label: 'MCP Servers', group: 'project' },
];

function SidebarTabIcon({ tab, isActive, onClick, badge }: { tab: SidebarTabConfig; isActive: boolean; onClick: () => void; badge?: number }) {
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
      {badge != null && badge > 0 && (
        <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pablo-gold px-0.5 font-ui text-[9px] font-bold text-pablo-bg">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

const panelComponents: Record<SidebarTab, React.ComponentType> = {
  sessions: SessionsPanel,
  files: FileExplorer,
  search: SearchPanel,
  git: GitPanel,
  activity: ActivityPanel,
  history: PromptHistoryPanel,
  checkpoints: CheckpointPanel,
  secrets: SecretsPanel,
  memory: MemoryPanel,
  metrics: MetricsPanel,
  mcp: MCPPanel,
};

export function Sidebar() {
  const { sidebarOpen, sidebarTab, setSidebarTab, sidebarWidth } = useUIStore();
  const dirtyCount = useEditorStore((s) => s.tabs.filter((t) => t.isDirty).length);
  const ActivePanel = panelComponents[sidebarTab];

  return (
    <aside
      className="flex h-full shrink-0 border-r border-pablo-border bg-pablo-panel"
      style={{ width: sidebarOpen ? sidebarWidth : 48 }}
      role="complementary"
      aria-label="Sidebar"
    >
      {/* Icon strip - always visible (Issue 10: grouped with dividers) */}
      <div className="flex w-12 shrink-0 flex-col border-r border-pablo-border bg-pablo-panel pt-1">
        {tabs.map((tab, i) => (
          <div key={tab.id}>
            {/* Group divider between core/ai/project */}
            {i > 0 && tabs[i - 1].group !== tab.group && (
              <div className="mx-2 my-1 h-px bg-pablo-border" />
            )}
            <SidebarTabIcon
              tab={tab}
              isActive={sidebarTab === tab.id}
              onClick={() => setSidebarTab(tab.id)}
              badge={tab.id === 'git' ? dirtyCount : undefined}
            />
          </div>
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
