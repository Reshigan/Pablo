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

interface TabConfig {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

/** Primary tabs — always visible */
const PRIMARY_TABS: TabConfig[] = [
  { id: 'editor', label: 'Editor', icon: Code2 },
  { id: 'preview', label: 'Preview', icon: Globe },
  { id: 'terminal', label: 'Terminal', icon: Terminal },
];

/** Overflow tabs — accessible via "More" menu */
const OVERFLOW_TABS: TabConfig[] = [
  { id: 'diff', label: 'Diff', icon: GitCompareArrows },
  { id: 'pipeline', label: 'Pipeline', icon: Play },
  { id: 'db-designer', label: 'DB Designer', icon: Database },
  { id: 'api-tester', label: 'API Tester', icon: TestTube2 },
  { id: 'dependencies', label: 'Packages', icon: Package },
  { id: 'deploy-logs', label: 'Deploys', icon: Rocket },
  { id: 'bugs', label: 'Problems', icon: Bug },
  { id: 'mission-control', label: 'Workers', icon: Target },
  { id: 'costs', label: 'Costs', icon: DollarSign },
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

  // Auto-show diff tab when diffs are pending
  const showDiffAsPrimary = pendingDiffCount > 0;

  // Determine which tabs to show as primary
  const visibleTabs = useMemo(() => {
    const tabs = [...PRIMARY_TABS];

    // Auto-promote diff tab when diffs pending
    if (showDiffAsPrimary) {
      const diffTab = OVERFLOW_TABS.find(t => t.id === 'diff');
      if (diffTab) tabs.splice(1, 0, diffTab); // After editor
    }

    // If active tab is in overflow, promote it to visible
    const activeInOverflow = OVERFLOW_TABS.find(t => t.id === activeWorkspaceTab);
    if (activeInOverflow && !tabs.find(t => t.id === activeWorkspaceTab)) {
      tabs.push(activeInOverflow);
    }

    return tabs;
  }, [activeWorkspaceTab, showDiffAsPrimary]);

  // Overflow tabs = all overflow tabs minus the ones already visible
  const overflowTabs = useMemo(() => {
    const visibleIds = new Set(visibleTabs.map(t => t.id));
    return OVERFLOW_TABS.filter(t => !visibleIds.has(t.id));
  }, [visibleTabs]);

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

  return (
    <div className="flex h-7 shrink-0 items-center border-b border-pablo-border bg-pablo-panel">
      {visibleTabs.map((tab) => {
        const TabIcon = tab.icon;
        const isActive = activeWorkspaceTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => setActiveWorkspaceTab(tab.id)}
            className={`group flex h-full items-center gap-1.5 border-r border-pablo-border px-3 font-ui text-xs transition-colors duration-100 ${
              isActive
                ? 'bg-pablo-bg text-pablo-text border-b-2 border-b-pablo-gold'
                : 'bg-pablo-panel text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
            }`}
          >
            <TabIcon size={14} className={isActive ? 'text-pablo-gold' : ''} />
            <span>{tab.label}</span>
            <TabBadge tabId={tab.id} />
          </button>
        );
      })}

      {/* Overflow menu */}
      {overflowTabs.length > 0 && (
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setOverflowOpen(!overflowOpen)}
            className="flex h-full items-center gap-1 px-2 font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
            aria-label="More tabs"
          >
            <MoreHorizontal size={14} />
          </button>

          {overflowOpen && (
            <div className="absolute left-0 top-full z-50 mt-0.5 w-44 rounded-md border border-pablo-border bg-pablo-panel py-1 shadow-lg">
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
