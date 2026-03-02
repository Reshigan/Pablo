'use client';

import { X, Code2, GitCompareArrows, Database, Globe, TestTube2 } from 'lucide-react';
import { useUIStore, type WorkspaceTab } from '@/stores/ui';

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
];

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
            {isActive && (
              <X
                size={12}
                className="ml-1 text-pablo-text-muted opacity-0 transition-opacity duration-100 group-hover:opacity-100 hover:text-pablo-text"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
