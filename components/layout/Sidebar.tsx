'use client';

import { Fragment, useEffect, useCallback } from 'react';
import {
  Files,
  Search,
  GitBranch,
  Brain,
  LayoutList,
  Flag,
  KeyRound,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type SidebarTab } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';
import { FileExplorer } from '@/components/sidebar/FileExplorer';
import { SearchPanel } from '@/components/sidebar/SearchPanel';
import { GitPanel } from '@/components/sidebar/GitPanel';
import { MemoryPanel } from '@/components/sidebar/MemoryPanel';
import { SessionsPanel } from '@/components/sidebar/SessionsPanel';
import { CheckpointPanel } from '@/components/sidebar/CheckpointPanel';
import { SecretsPanel } from '@/components/sidebar/SecretsPanel';

interface SidebarTabConfig {
  id: SidebarTab;
  icon: LucideIcon;
  label: string;
  group: 'core' | 'ai' | 'project';
}

// Task 35: Reduced to 7 primary tabs — Metrics, MCP, Activity, History moved to Settings
const tabs: SidebarTabConfig[] = [
  // Core (daily use)
  { id: 'files', icon: Files, label: 'Files', group: 'core' },
  { id: 'search', icon: Search, label: 'Search', group: 'core' },
  { id: 'git', icon: GitBranch, label: 'Git', group: 'core' },
  // AI
  { id: 'sessions', icon: LayoutList, label: 'Sessions', group: 'ai' },
  { id: 'memory', icon: Brain, label: 'Memory', group: 'ai' },
  // Project
  { id: 'secrets', icon: KeyRound, label: 'Secrets', group: 'project' },
  { id: 'checkpoints', icon: Flag, label: 'Checkpoints', group: 'project' },
];

function SidebarTabIcon({ tab, isActive, onClick, badge }: { tab: SidebarTabConfig; isActive: boolean; onClick: () => void; badge?: number }) {
  const TabIcon = tab.icon;
  return (
    <button
      onClick={onClick}
      className={`relative flex h-9 w-full items-center justify-center transition-colors duration-150 hover:bg-pablo-hover ${
        isActive ? 'text-pablo-gold' : 'text-pablo-text-muted hover:text-pablo-text-dim'
      }`}
      aria-label={tab.label}
      title={tab.label}
    >
      {isActive && (
        <div className="absolute left-0 top-1 bottom-1 w-[2px] rounded-r bg-pablo-gold" />
      )}
      <TabIcon size={18} />
      {badge != null && badge > 0 && (
        <span className="absolute right-0.5 top-0.5 flex h-3.5 min-w-[14px] items-center justify-center rounded-full bg-pablo-gold px-0.5 font-ui text-[8px] font-bold text-pablo-bg">
          {badge > 99 ? '99+' : badge}
        </span>
      )}
    </button>
  );
}

const panelComponents: Partial<Record<SidebarTab, React.ComponentType>> = {
  sessions: SessionsPanel,
  files: FileExplorer,
  search: SearchPanel,
  git: GitPanel,
  checkpoints: CheckpointPanel,
  secrets: SecretsPanel,
  memory: MemoryPanel,
};

export function Sidebar() {
  const { sidebarOpen, sidebarTab, setSidebarTab, toggleSidebar } = useUIStore();
  const dirtyCount = useEditorStore((s) => s.tabs.filter((t) => t.isDirty).length);
  const ActivePanel = panelComponents[sidebarTab];

  // Guard: reset stale persisted sidebarTab to 'files' if it references a removed tab
  useEffect(() => {
    if (sidebarOpen && !panelComponents[sidebarTab]) {
      setSidebarTab('files');
    }
  }, [sidebarOpen, sidebarTab, setSidebarTab]);

  // Task 35: Close sidebar on Escape key (skip if modal just handled it)
  const handleEscape = useCallback((e: KeyboardEvent) => {
    if (e.key !== 'Escape' || !sidebarOpen || e.defaultPrevented) return;
    // Defer to next tick so modal handlers can update state first
    requestAnimationFrame(() => {
      const ui = useUIStore.getState();
      if (!ui.commandPaletteOpen && !ui.settingsOpen && ui.sidebarOpen) {
        toggleSidebar();
      }
    });
  }, [sidebarOpen, toggleSidebar]);

  useEffect(() => {
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [handleEscape]);

  return (
    <>
      {/* Task 35: Icon rail — hidden on mobile (<768px), visible on md+ */}
      <aside className="relative z-30 hidden md:flex w-11 shrink-0 flex-col border-r border-pablo-border bg-pablo-surface-0">
        <div className="flex flex-col gap-0.5 pt-2">
          {tabs.map((tab, i) => (
            <Fragment key={tab.id}>
              {i > 0 && tabs[i - 1].group !== tab.group && (
                <div className="mx-2 my-1.5 h-px bg-pablo-border" />
              )}
              <SidebarTabIcon
                tab={tab}
                isActive={sidebarOpen && sidebarTab === tab.id}
                onClick={() => {
                  if (sidebarOpen && sidebarTab === tab.id) {
                    toggleSidebar(); // Close if clicking active tab
                  } else {
                    setSidebarTab(tab.id);
                    if (!sidebarOpen) toggleSidebar();
                  }
                }}
                badge={tab.id === 'git' ? dirtyCount : undefined}
              />
            </Fragment>
          ))}
        </div>
      </aside>

      {/* Task 35: Panel overlay — floats over workspace */}
      {sidebarOpen && (
        <>
          {/* Backdrop — click to close */}
          <div
            className="fixed inset-0 top-12 z-20 bg-black/20"
            onClick={toggleSidebar}
          />
          <div
            className="fixed top-12 z-40 border-r border-pablo-border bg-pablo-surface-1 shadow-elevated panel-transition animate-slide-in overflow-hidden flex flex-col left-0 right-0 bottom-14 md:left-11 md:right-auto md:bottom-6 md:w-72"
            style={{ borderRadius: '0 12px 12px 0' }}
          >
            {/* Panel header */}
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-pablo-border px-3">
              <span className="font-ui text-xs font-semibold text-pablo-text-secondary uppercase tracking-wider">
                {tabs.find(t => t.id === sidebarTab)?.label}
              </span>
              <button
                onClick={toggleSidebar}
                className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text"
              >
                <X size={14} />
              </button>
            </div>
            {/* Panel content */}
            <div className="flex-1 overflow-y-auto">
              {ActivePanel && <ActivePanel />}
            </div>
          </div>
        </>
      )}
    </>
  );
}
