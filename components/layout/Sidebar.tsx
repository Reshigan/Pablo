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
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type SidebarTab } from '@/stores/ui';
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
}

const tabs: SidebarTabConfig[] = [
  { id: 'sessions', icon: LayoutList, label: 'Sessions' },
  { id: 'files', icon: Files, label: 'File Explorer' },
  { id: 'search', icon: Search, label: 'Search' },
  { id: 'git', icon: GitBranch, label: 'Source Control' },
  { id: 'activity', icon: Activity, label: 'Activity Feed' },
  { id: 'history', icon: History, label: 'Prompt History' },
  { id: 'checkpoints', icon: Flag, label: 'Checkpoints' },
  { id: 'secrets', icon: KeyRound, label: 'Secrets Vault' },
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
