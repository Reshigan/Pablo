'use client';

import { TopBar } from '@/components/layout/TopBar';
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { PanelResizer } from '@/components/layout/PanelResizer';
import { WorkspaceArea } from '@/components/workspace/WorkspaceArea';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { TerminalPanel } from '@/components/workspace/Terminal';
import { CommandPalette } from '@/components/modals/CommandPalette';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { WelcomeModal } from '@/components/modals/WelcomeModal';
import { ToastContainer } from '@/components/shared/ToastContainer';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useUIStore } from '@/stores/ui';
import { useSessionStore } from '@/stores/session';
import { useChatStore } from '@/stores/chat';
import { usePipelineStore } from '@/stores/pipeline';
import { useEditorStore } from '@/stores/editor';
import { useRepoStore } from '@/stores/repo';
import { useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const initRef = useRef(false);

  const {
    sidebarOpen,
    chatOpen,
    chatWidth,
    sidebarWidth,
    terminalOpen,
    terminalHeight,
    toggleSidebar,
    toggleChat,
    toggleTerminal,
    toggleCommandPalette,
    setSidebarWidth,
    setChatWidth,
    setTerminalHeight,
    setActiveWorkspaceTab,
  } = useUIStore();

  const {
    currentSessionId,
    isLoading,
    createSession,
    loadSession,
    saveSession,
    setCurrentSessionId,
  } = useSessionStore();

  // Initialize session on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    if (id === 'new') {
      // Create a fresh session and redirect to its ID
      createSession().then((session) => {
        router.replace(`/session/${session.id}`);
      }).catch(() => {
        // If session creation fails, set a temporary ID so the IDE still works
        setCurrentSessionId(`local-${Date.now()}`);
      });
    } else {
      // Load existing session and restore state
      loadSession(id).catch(() => {
        // Session not found in API — just set the ID so IDE works
        setCurrentSessionId(id);
      });
    }
  }, [id, createSession, loadSession, setCurrentSessionId, router]);

  // Save session on beforeunload (page close/refresh)
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sessionId = useSessionStore.getState().currentSessionId;
      if (sessionId && !sessionId.startsWith('local-')) {
        // Use sendBeacon for reliable save on page close
        const snapshot = captureSnapshotSync();
        if (snapshot) {
          const blob = new Blob(
            [JSON.stringify({ snapshot })],
            { type: 'application/json' }
          );
          navigator.sendBeacon(`/api/sessions/${sessionId}`, blob);
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const isMeta = e.metaKey || e.ctrlKey;

      if (isMeta && e.key === 'b') {
        e.preventDefault();
        toggleSidebar();
      }
      if (isMeta && e.key === 'j') {
        e.preventDefault();
        toggleChat();
      }
      if (isMeta && e.key === '`') {
        e.preventDefault();
        toggleTerminal();
      }
      // Issue 15: Cmd+Shift+P for command palette (instead of Cmd+K)
      if (isMeta && e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        toggleCommandPalette();
        return;
      }
      // Issue 14: Cmd+P for Preview toggle
      if (isMeta && !e.shiftKey && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        const current = useUIStore.getState().activeWorkspaceTab;
        setActiveWorkspaceTab(current === 'preview' ? 'editor' : 'preview');
        return;
      }
      // Issue 14: Cmd+D for Diff tab
      if (isMeta && e.key === 'd') {
        e.preventDefault();
        setActiveWorkspaceTab('diff');
      }
      // Cmd+K reserved for inline edit (Feature 5)
      // Cmd+S: Save session
      if (isMeta && e.key === 's') {
        e.preventDefault();
        saveSession().catch(() => { /* non-blocking */ });
      }
    },
    [toggleSidebar, toggleChat, toggleTerminal, toggleCommandPalette, saveSession, setActiveWorkspaceTab]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Show loading state while initializing session
  if (isLoading && !currentSessionId) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-pablo-bg">
        <div className="flex flex-col items-center gap-3">
          <Loader2 size={32} className="animate-spin text-pablo-gold" />
          <p className="font-ui text-sm text-pablo-text-dim">Loading session...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-pablo-bg">
      {/* Top Bar */}
      <TopBar agentStatus="idle" />

      {/* Main Area: Sidebar + Workspace + Chat */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>

        {/* Sidebar Resize Handle */}
        {sidebarOpen && (
          <PanelResizer
            direction="horizontal"
            onResize={(delta) => setSidebarWidth(prev => prev + delta)}
          />
        )}

        {/* Workspace */}
        <ErrorBoundary name="Workspace">
          <WorkspaceArea />
        </ErrorBoundary>

        {/* Chat Resize Handle */}
        {chatOpen && (
          <PanelResizer
            direction="horizontal"
            onResize={(delta) => setChatWidth(prev => prev - delta)}
          />
        )}

        {/* Chat Panel */}
        {chatOpen && (
          <div
            className="flex h-full shrink-0 flex-col border-l border-pablo-border"
            style={{ width: chatWidth }}
          >
            <ErrorBoundary name="Chat">
              <ChatPanel />
            </ErrorBoundary>
          </div>
        )}
      </div>

      {/* Terminal with resize handle (Issue 5) */}
      {terminalOpen && (
        <>
          <PanelResizer
            direction="vertical"
            onResize={(delta) => setTerminalHeight(prev => prev - delta)}
          />
          <div className="shrink-0 border-t border-pablo-border bg-pablo-panel">
            <div className="flex h-6 items-center justify-between border-b border-pablo-border px-3">
              <span className="font-ui text-[11px] font-semibold uppercase tracking-wider text-pablo-text-dim">
                Terminal
              </span>
            </div>
            <div style={{ height: terminalHeight }}>
              <ErrorBoundary name="Terminal">
                <TerminalPanel />
              </ErrorBoundary>
            </div>
          </div>
        </>
      )}

      {/* Status Bar */}
      <StatusBar />

      {/* Modals & Overlays */}
      <CommandPalette />
      <SettingsModal />
      <WelcomeModal />
      <ToastContainer />
    </div>
  );
}

/**
 * Synchronous snapshot capture for sendBeacon on page close.
 * Returns null if stores aren't available.
 */
function captureSnapshotSync(): Record<string, unknown> | null {
  try {
    const chat = useChatStore.getState();
    const pipeline = usePipelineStore.getState();
    const editor = useEditorStore.getState();
    const repo = useRepoStore.getState();

    return {
      messages: chat.messages,
      pipelineRuns: pipeline.runs,
      editorTabs: editor.tabs,
      activeTabId: editor.activeTabId,
      pendingDiffs: editor.pendingDiffs,
      selectedRepo: repo.selectedRepo,
      selectedBranch: repo.selectedBranch,
    };
  } catch {
    return null;
  }
}
