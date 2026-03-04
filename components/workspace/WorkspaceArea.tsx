'use client';

import { WorkspaceTabs } from './WorkspaceTabs';
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
import { useUIStore } from '@/stores/ui';
import { useEditorStore } from '@/stores/editor';

function EditorPanel() {
  const { tabs, activeTabId } = useEditorStore();
  const hasOpenFile = tabs.length > 0 && activeTabId !== null;

  if (!hasOpenFile) {
    // Issue 1: Show PipelineView as default when no files are open
    return <PipelineView />;
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
  };

  const ActivePanel = panels[activeWorkspaceTab];

  return (
    <div className="flex min-w-0 flex-1 flex-col bg-pablo-bg">
      <WorkspaceTabs />
      <ActivePanel />
    </div>
  );
}
