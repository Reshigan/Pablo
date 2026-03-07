'use client';

/**
 * MobileTabBar — Bottom tab bar for mobile viewports (<768px).
 * Replaces the sidebar icon rail on small screens (Task 30).
 */

import {
  Files,
  MessageSquare,
  Code2,
  Play,
  Globe,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type SidebarTab } from '@/stores/ui';

interface MobileTab {
  id: string;
  icon: LucideIcon;
  label: string;
  action: () => void;
}

export function MobileTabBar() {
  const {
    mobileMode,
    activeWorkspaceTab,
    setActiveWorkspaceTab,
    toggleSidebar,
    toggleChat,
    chatOpen,
    sidebarOpen,
    sidebarTab,
    setSidebarTab,
  } = useUIStore();

  if (!mobileMode) return null;

  /** Open a specific sidebar panel (or toggle if already showing that panel) */
  const openSidebarPanel = (tab: SidebarTab) => {
    if (sidebarOpen && sidebarTab === tab) {
      toggleSidebar(); // close
    } else {
      setSidebarTab(tab);
      if (!sidebarOpen) toggleSidebar();
    }
  };

  /* CHANGE 9: Reorder — Build first, Code, Preview, Chat, Files. No "Editor" label. */
  const tabs: MobileTab[] = [
    {
      id: 'pipeline',
      icon: Play,
      label: 'Build',
      action: () => {
        if (sidebarOpen) toggleSidebar();
        setActiveWorkspaceTab('pipeline');
      },
    },
    {
      id: 'editor',
      icon: Code2,
      label: 'Code',
      action: () => {
        if (sidebarOpen) toggleSidebar();
        setActiveWorkspaceTab('editor');
      },
    },
    {
      id: 'preview',
      icon: Globe,
      label: 'Preview',
      action: () => {
        if (sidebarOpen) toggleSidebar();
        setActiveWorkspaceTab('preview');
      },
    },
    {
      id: 'chat',
      icon: MessageSquare,
      label: 'Chat',
      action: () => toggleChat(),
    },
    {
      id: 'files',
      icon: Files,
      label: 'Files',
      action: () => openSidebarPanel('files'),
    },
  ];

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-50 flex h-14 items-center justify-around border-t border-pablo-border bg-pablo-panel md:hidden"
      aria-label="Mobile navigation"
    >
      {tabs.map((tab) => {
        const TabIcon = tab.icon;
        const isActive =
          (tab.id === 'files' && sidebarOpen && sidebarTab === 'files') ||
          (tab.id === 'editor' && !sidebarOpen && activeWorkspaceTab === 'editor') ||
          (tab.id === 'pipeline' && !sidebarOpen && activeWorkspaceTab === 'pipeline') ||
          (tab.id === 'preview' && !sidebarOpen && activeWorkspaceTab === 'preview') ||
          (tab.id === 'chat' && chatOpen);
        return (
          <button
            key={tab.id}
            onClick={tab.action}
            className={`flex flex-col items-center justify-center gap-0.5 px-3 py-1 transition-colors ${
              isActive
                ? 'text-pablo-gold'
                : 'text-pablo-text-muted hover:text-pablo-text-dim'
            }`}
            aria-label={tab.label}
          >
            <TabIcon size={20} />
            <span className="font-ui text-[9px] font-medium">{tab.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
