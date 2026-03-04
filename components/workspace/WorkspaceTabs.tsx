'use client';

import { Code2, GitCompareArrows, Database, Globe, TestTube2, Play, Package, Rocket, Bug } from 'lucide-react';
import { useUIStore, type WorkspaceTab } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';

interface TabConfig {
  id: WorkspaceTab;
  label: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
}

const workspaceTabs: TabConfig[] = [
  { id: 'editor', label: 'Editor', icon: Code2 },
  { id: 'diff', label: 'Diff', icon: GitCompareArrows },
  { id: 'db-designer', label: 'DB Designer', icon: Database },
  { id: 'api-tester', label: 'API Tester', icon: TestTube2 },
  { id: 'preview', label: 'Preview', icon: Globe },
  { id: 'pipeline', label: 'Pipeline', icon: Play },
  { id: 'dependencies', label: 'Packages', icon: Package },
  { id: 'deploy-logs', label: 'Deploys', icon: Rocket },
  { id: 'bugs', label: 'Problems', icon: Bug },
];

function TabBadge({ tabId }: { tabId: WorkspaceTab }) {
  const pendingDiffCount = useEditorStore(s => s.pendingDiffs.filter(d => d.status === 'pending').length);
  const activePipelineRun = usePipelineStore(s => s.runs.find(r => r.status === 'running'));

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

  return (
    <div className="flex h-9 shrink-0 items-center border-b border-pablo-border bg-pablo-panel">
      {workspaceTabs.map((tab) => {
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
    </div>
  );
}
