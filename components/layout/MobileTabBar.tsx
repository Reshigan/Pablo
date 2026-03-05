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
  Settings,
  type LucideIcon,
} from 'lucide-react';
import { useUIStore, type WorkspaceTab } from '@/stores/ui';

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
    toggleSettings,
  } = useUIStore();

  if (!mobileMode) return null;

  const tabs: MobileTab[] = [
    {
      id: 'files',
      icon: Files,
      label: 'Files',
      action: () => toggleSidebar(),
    },
    {
      id: 'editor',
      icon: Code2,
      label: 'Editor',
      action: () => setActiveWorkspaceTab('editor'),
    },
    {
      id: 'pipeline',
      icon: Play,
      label: 'Build',
      action: () => setActiveWorkspaceTab('pipeline'),
    },
    {
      id: 'chat',
      icon: MessageSquare,
      label: 'Chat',
      action: () => toggleChat(),
    },
    {
      id: 'settings',
      icon: Settings,
      label: 'Settings',
      action: () => toggleSettings(),
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
          (tab.id === 'editor' && activeWorkspaceTab === 'editor') ||
          (tab.id === 'pipeline' && activeWorkspaceTab === 'pipeline');
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
