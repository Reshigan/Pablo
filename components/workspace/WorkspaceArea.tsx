'use client';

import { FileTabs } from './FileTabs';
import { CodeEditor } from './CodeEditor';
import { DiffViewer } from './DiffViewer';
import { DBDesigner } from './DBDesigner';
import { APITester } from './APITester';
import { LivePreview } from './LivePreview';
import { PipelineView } from '@/components/pipeline/PipelineView';
import { DependencyManager } from './DependencyManager';
import { DeployLogs } from './DeployLogs';
import { BugScannerPanel } from './BugScannerPanel';
import { TerminalPanel } from './Terminal';
import { MissionControl } from './MissionControl';
import { CostDashboard } from './CostDashboard';
import { useUIStore } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';
import { useSessionStore } from '@/stores/session';
import { Loader2, Play } from 'lucide-react';

/** Code tab: show editor if files open, otherwise hint to use Build tab */
function EditorPanel() {
  const { tabs, activeTabId } = useEditorStore();
  const isSessionLoading = useSessionStore(s => s.isLoading);
  const hasOpenFile = tabs.length > 0 && activeTabId !== null;

  // FIX 1 (Session UX): Loading guard prevents flash during session restore
  if (isSessionLoading) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg">
        <Loader2 size={24} className="animate-spin text-pablo-gold" />
        <p className="font-ui text-sm text-pablo-text-dim">Loading session...</p>
      </div>
    );
  }

  if (!hasOpenFile) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center px-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10 border border-pablo-gold/15">
          <Play size={24} className="text-pablo-gold" />
        </div>
        <p className="font-ui text-sm text-pablo-text-dim">No files open</p>
        <p className="font-ui text-xs text-pablo-text-muted max-w-xs">
          Use the <strong className="text-pablo-gold">Build</strong> tab to generate code, or open a file from the sidebar.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <FileTabs />
      <CodeEditor />
    </div>
  );
}

export function WorkspaceArea() {
  const { activeWorkspaceTab } = useUIStore();

  const panels = {
    editor: EditorPanel,
    diff: DiffViewer,
    'db-designer': DBDesigner,
    'api-tester': APITester,
    preview: LivePreview,
    pipeline: PipelineView,
    dependencies: DependencyManager,
    'deploy-logs': DeployLogs,
    bugs: BugScannerPanel,
    terminal: TerminalPanel,
    'mission-control': MissionControl,
    costs: CostDashboard,
  };

  const ActivePanel = panels[activeWorkspaceTab];

  return (
    <div className="flex min-w-0 min-h-0 flex-1 flex-col overflow-hidden bg-pablo-bg">
      <ActivePanel />
    </div>
  );
}
