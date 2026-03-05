'use client';

import { TopBar } from '@/components/layout/TopBar';
// UX-14: ContextBar removed — repo/branch info merged into StatusBar
import { Sidebar } from '@/components/layout/Sidebar';
import { StatusBar } from '@/components/layout/StatusBar';
import { PanelResizer } from '@/components/layout/PanelResizer';
import { WorkspaceArea } from '@/components/workspace/WorkspaceArea';
import { ChatPanel } from '@/components/chat/ChatPanel';
import { CommandPalette } from '@/components/modals/CommandPalette';
import { SettingsModal } from '@/components/modals/SettingsModal';
import { WelcomeModal } from '@/components/modals/WelcomeModal';
import { ToastContainer } from '@/components/shared/ToastContainer';
import { MobileTabBar } from '@/components/layout/MobileTabBar';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { ActivityIndicator } from '@/components/shared/ActivityIndicator';
import { useUIStore, type WorkspaceTab } from '@/stores/ui';
import { useSessionStore } from '@/stores/session';
import { useChatStore } from '@/stores/chat';
import { usePipelineStore } from '@/stores/pipeline';
import { useEditorStore } from '@/stores/editor';
import { useRepoStore } from '@/stores/repo';
import { useLearningStore } from '@/stores/learning';
import { useEffect, useCallback, useRef, use } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, MessageSquare } from 'lucide-react';

export default function SessionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const initRef = useRef(false);

  const {
    chatOpen,
    chatWidth,
    mobileMode,
    toggleSidebar,
    toggleChat,
    toggleTerminal,
    toggleCommandPalette,
    setChatWidth,
    setActiveWorkspaceTab,
  } = useUIStore();

  // UX-07 + Task 30: Responsive breakpoints
  useEffect(() => {
    function handleResize() {
      const w = window.innerWidth;
      const state = useUIStore.getState();

      if (w < 768) {
        // Mobile: collapse both panels, set mobileMode
        if (!state.mobileMode) state.setMobileMode(true);
        if (state.tabletMode) state.setTabletMode(false);
        if (state.sidebarOpen) state.toggleSidebar();
        if (state.chatOpen) state.toggleChat();
      } else if (w < 1024) {
        // Tablet: collapse sidebar, keep chat
        if (state.mobileMode) state.setMobileMode(false);
        if (!state.tabletMode) state.setTabletMode(true);
        if (state.sidebarOpen) state.toggleSidebar();
      } else {
        // Desktop
        if (state.mobileMode) state.setMobileMode(false);
        if (state.tabletMode) state.setTabletMode(false);
      }
    }
    handleResize(); // Check on mount
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const {
    currentSessionId,
    isLoading,
    createSession,
    loadSession,
    saveSession,
    setCurrentSessionId,
  } = useSessionStore();

  // Hydrate learning store from D1 on mount
  useEffect(() => {
    useLearningStore.getState().hydrate().catch(() => { /* non-blocking */ });
  }, []);

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
      // UX-16: Cmd+1..9 to switch workspace tabs by index
      if (isMeta && !e.shiftKey && e.key >= '1' && e.key <= '9') {
        e.preventDefault();
        const tabOrder: WorkspaceTab[] = ['editor', 'preview', 'terminal', 'diff', 'pipeline', 'db-designer', 'api-tester', 'dependencies', 'deploy-logs'];
        const idx = parseInt(e.key, 10) - 1;
        if (idx < tabOrder.length) {
          setActiveWorkspaceTab(tabOrder[idx]);
        }
      }
    },
    [toggleSidebar, toggleChat, toggleTerminal, toggleCommandPalette, saveSession, setActiveWorkspaceTab]
    // toggleTerminal now switches workspace tab to 'terminal' instead of toggling a bottom panel
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
    <div className={`flex h-screen w-screen flex-col overflow-hidden bg-pablo-bg ${mobileMode ? 'pb-14' : ''}`}>
      {/* Top Bar */}
      <TopBar />

      {/* UX-14: ContextBar removed — repo/branch info now in StatusBar */}

      {/* Main Area: Sidebar icon rail + Workspace (full width) */}
      <div className="flex min-h-0 flex-1">
        {/* Sidebar — icon rail always visible, panel is overlay */}
        <ErrorBoundary name="Sidebar">
          <Sidebar />
        </ErrorBoundary>

        {/* Workspace — gets full remaining width */}
        <ErrorBoundary name="Workspace">
          <WorkspaceArea />
        </ErrorBoundary>
      </div>

      {/* Task 37: Floating chat toggle button */}
      {!chatOpen && (
        <button
          onClick={toggleChat}
          className="fixed bottom-16 right-4 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-pablo-gold text-pablo-bg shadow-lg transition-transform hover:scale-105 active:scale-95"
          aria-label="Open chat"
        >
          <MessageSquare size={20} />
        </button>
      )}

      {/* Task 37: Chat slide-over overlay */}
      {chatOpen && (
        <div
          className="fixed right-0 top-12 bottom-6 z-30 flex flex-col border-l border-pablo-border bg-pablo-surface-2/95 backdrop-blur-sm shadow-elevated"
          style={{ width: chatWidth }}
        >
          {/* Absolutely positioned left-edge resize handle */}
          <div className="absolute left-0 top-0 bottom-0 z-10">
            <PanelResizer
              direction="horizontal"
              onResize={(delta) => setChatWidth(prev => prev - delta)}
            />
          </div>
          <ErrorBoundary name="Chat">
            <ChatPanel />
          </ErrorBoundary>
        </div>
      )}

      {/* Task 38: Activity indicator — floating status pill */}
      <ActivityIndicator />

      {/* Status Bar — hidden on mobile since MobileTabBar replaces it */}
      {!mobileMode && <StatusBar />}

      {/* Modals & Overlays */}
      <CommandPalette />
      <SettingsModal />
      <WelcomeModal />
      <ToastContainer />

      {/* Task 30: Mobile bottom tab bar */}
      <MobileTabBar />
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
