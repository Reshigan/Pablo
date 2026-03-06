'use client';

import { FileTabs } from './FileTabs';
import { CodeEditor } from './CodeEditor';
import { DiffViewer } from './DiffViewer';
import { DBDesigner } from './DBDesigner';
import { APITester } from './APITester';
import { LivePreview } from './LivePreview';
import { PipelineView } from '@/components/pipeline/PipelineView';
import { HeroPrompt } from '@/components/pipeline/HeroPrompt';
import { DependencyManager } from './DependencyManager';
import { DeployLogs } from './DeployLogs';
import { BugScannerPanel } from './BugScannerPanel';
import { TerminalPanel } from './Terminal';
import { MissionControl } from './MissionControl';
import { CostDashboard } from './CostDashboard';
import { useUIStore } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';

/** Task 40: Show HeroPrompt when idle, PipelineView when running, Editor otherwise */
function EditorPanel() {
  const { tabs, activeTabId, pendingDiffs } = useEditorStore();
  const runs = usePipelineStore(s => s.runs);
  const pendingPrompt = usePipelineStore(s => s.pendingPrompt);
  const hasOpenFile = tabs.length > 0 && activeTabId !== null;
  const hasRuns = runs.length > 0;
  // Also count pending diffs as "has content" — pipeline generates files into diffs
  const hasPendingDiffs = pendingDiffs.length > 0;

  // Show PipelineView when there's a pending prompt (HeroPrompt queued it)
  // so the useEffect in PipelineView can pick it up and execute.
  // Also show PipelineView when there are runs OR pending diffs (session restored with pipeline data)
  if (!hasOpenFile && !hasRuns && !pendingPrompt && !hasPendingDiffs) return <HeroPrompt />;
  if (!hasOpenFile && (hasRuns || pendingPrompt || hasPendingDiffs)) return <PipelineView />;

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
    <div className="flex min-w-0 flex-1 flex-col bg-pablo-bg">
      <ActivePanel />
    </div>
  );
}
