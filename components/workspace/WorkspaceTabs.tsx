'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import {
  Code2, GitCompareArrows, Globe, Terminal,
  Database, TestTube2, Play, Package, Rocket, Bug,
  MoreHorizontal, Target, DollarSign,
} from 'lucide-react';
import { useUIStore, type WorkspaceTab } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';
import { useRepoStore } from '@/stores/repo';

interface TabConfig {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  /** Only show this tab when condition is met (progressive disclosure) */
  showWhen?: 'always' | 'has-repo' | 'has-diffs' | 'has-pipeline';
}

/** Primary tabs — always visible */
const PRIMARY_TABS: TabConfig[] = [
  { id: 'editor', label: 'Editor', icon: Code2, showWhen: 'always' },
  { id: 'preview', label: 'Preview', icon: Globe, showWhen: 'always' },
  { id: 'terminal', label: 'Terminal', icon: Terminal, showWhen: 'always' },
];

/** Overflow tabs — shown progressively based on context */
const OVERFLOW_TABS: TabConfig[] = [
  { id: 'diff', label: 'Diff', icon: GitCompareArrows, showWhen: 'has-diffs' },
  { id: 'pipeline', label: 'Pipeline', icon: Play, showWhen: 'has-pipeline' },
  { id: 'db-designer', label: 'DB Designer', icon: Database, showWhen: 'has-repo' },
  { id: 'api-tester', label: 'API Tester', icon: TestTube2, showWhen: 'has-repo' },
  { id: 'dependencies', label: 'Packages', icon: Package, showWhen: 'has-repo' },
  { id: 'deploy-logs', label: 'Deploys', icon: Rocket, showWhen: 'has-repo' },
  { id: 'bugs', label: 'Problems', icon: Bug, showWhen: 'has-repo' },
  { id: 'mission-control', label: 'Workers', icon: Target, showWhen: 'has-pipeline' },
  { id: 'costs', label: 'Costs', icon: DollarSign, showWhen: 'has-pipeline' },
];

function TabBadge({ tabId }: { tabId: WorkspaceTab }) {
  const pendingDiffs = useEditorStore(s => s.pendingDiffs);
  const pendingDiffCount = useMemo(() => pendingDiffs.filter(d => d.status === 'pending').length, [pendingDiffs]);
  const runs = usePipelineStore(s => s.runs);
  const activePipelineRun = useMemo(() => runs.find(r => r.status === 'running'), [runs]);

  if (tabId === 'diff' && pendingDiffCount > 0) {
    return (
      <span className="ml-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-pablo-gold px-1 font-ui text-[9px] font-bold text-pablo-bg">
        {pendingDiffCount}
      </span>
    );
  }
  if (tabId === 'pipeline' && activePipelineRun) {
    return (
      <span className="ml-1 h-2 w-2 rounded-full bg-pablo-green animate-pulse" />
    );
  }
  return null;
}

export function WorkspaceTabs() {
  const { activeWorkspaceTab, setActiveWorkspaceTab } = useUIStore();
  const [overflowOpen, setOverflowOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const pendingDiffs = useEditorStore(s => s.pendingDiffs);
  const pendingDiffCount = useMemo(() => pendingDiffs.filter(d => d.status === 'pending').length, [pendingDiffs]);
  const hasRepo = !!useRepoStore(s => s.selectedRepo);
  const runs = usePipelineStore(s => s.runs);
  const hasPipeline = runs.length > 0;

  // Auto-show diff tab when diffs are pending
  const showDiffAsPrimary = pendingDiffCount > 0;

  /** Progressive disclosure: filter overflow tabs by context */
  const contextualOverflow = useMemo(() => {
    return OVERFLOW_TABS.filter((t) => {
      if (!t.showWhen || t.showWhen === 'always') return true;
      if (t.showWhen === 'has-repo') return hasRepo;
      if (t.showWhen === 'has-diffs') return pendingDiffCount > 0;
      if (t.showWhen === 'has-pipeline') return hasPipeline;
      return true;
    });
  }, [hasRepo, pendingDiffCount, hasPipeline]);

  // Determine which tabs to show as primary
  const visibleTabs = useMemo(() => {
    const tabs = [...PRIMARY_TABS];

    // Auto-promote diff tab when diffs pending
    if (showDiffAsPrimary) {
      const diffTab = contextualOverflow.find(t => t.id === 'diff');
      if (diffTab) tabs.splice(1, 0, diffTab); // After editor
    }

    // If active tab is in overflow, promote it to visible
    const activeInOverflow = contextualOverflow.find(t => t.id === activeWorkspaceTab);
    if (activeInOverflow && !tabs.find(t => t.id === activeWorkspaceTab)) {
      tabs.push(activeInOverflow);
    }

    return tabs;
  }, [activeWorkspaceTab, showDiffAsPrimary, contextualOverflow]);

  // Overflow tabs = contextual overflow tabs minus the ones already visible
  const overflowTabs = useMemo(() => {
    const visibleIds = new Set(visibleTabs.map(t => t.id));
    return contextualOverflow.filter(t => !visibleIds.has(t.id));
  }, [visibleTabs, contextualOverflow]);

  // Close overflow menu on outside click
  useEffect(() => {
    if (!overflowOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOverflowOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [overflowOpen]);

  /* Task 36: Pill-style tab switcher */
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-pablo-border bg-pablo-surface-0 p-0.5">
      {visibleTabs.map((tab) => {
        const TabIcon = tab.icon;
        const isActive = activeWorkspaceTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveWorkspaceTab(tab.id)}
            className={`flex items-center gap-1 rounded-md px-2.5 py-1 font-ui text-[11px] transition-all duration-100 ${
              isActive
                ? 'bg-pablo-gold/10 text-pablo-gold shadow-sm'
                : 'text-pablo-text-muted hover:text-pablo-text-secondary hover:bg-pablo-hover'
            }`}
          >
            <TabIcon size={13} />
            <span className="hidden sm:inline">{tab.label}</span>
            <TabBadge tabId={tab.id} />
          </button>
        );
      })}

      {/* Overflow menu */}
      {overflowTabs.length > 0 && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOverflowOpen(!overflowOpen)}
            className="flex items-center rounded-md px-1.5 py-1 text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
            aria-label="More tabs"
          >
            <MoreHorizontal size={14} />
          </button>

          {overflowOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-lg border border-pablo-border bg-pablo-surface-2 py-1 shadow-elevated animate-slide-in">
              {overflowTabs.map((tab) => {
                const TabIcon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => {
                      setActiveWorkspaceTab(tab.id);
                      setOverflowOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-xs text-pablo-text-dim transition-colors hover:bg-pablo-hover hover:text-pablo-text"
                  >
                    <TabIcon size={12} />
                    {tab.label}
                    <TabBadge tabId={tab.id} />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
