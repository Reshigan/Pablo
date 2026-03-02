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
import { ToastContainer } from '@/components/shared/ToastContainer';
import { ErrorBoundary } from '@/components/shared/ErrorBoundary';
import { useUIStore } from '@/stores/ui';
import { useEffect, useCallback } from 'react';

export default function SessionPage() {
  const {
    sidebarOpen,
    chatOpen,
    chatWidth,
    sidebarWidth,
    terminalOpen,
    toggleSidebar,
    toggleChat,
    toggleTerminal,
    toggleCommandPalette,
    setSidebarWidth,
    setChatWidth,
  } = useUIStore();

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
      if (isMeta && e.key === 'k') {
        e.preventDefault();
        toggleCommandPalette();
      }
    },
    [toggleSidebar, toggleChat, toggleTerminal, toggleCommandPalette]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

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
            onResize={(delta) => setSidebarWidth(sidebarWidth + delta)}
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
            onResize={(delta) => setChatWidth(chatWidth - delta)}
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

      {/* Terminal */}
      {terminalOpen && (
        <div className="shrink-0 border-t border-pablo-border bg-pablo-panel">
          <div className="flex h-6 items-center justify-between border-b border-pablo-border px-3">
            <span className="font-ui text-[11px] font-semibold uppercase tracking-wider text-pablo-text-dim">
              Terminal
            </span>
          </div>
          <div style={{ height: 180 }}>
            <ErrorBoundary name="Terminal">
              <TerminalPanel />
            </ErrorBoundary>
          </div>
        </div>
      )}

      {/* Status Bar */}
      <StatusBar />

      {/* Modals & Overlays */}
      <CommandPalette />
      <SettingsModal />
      <ToastContainer />
    </div>
  );
}
