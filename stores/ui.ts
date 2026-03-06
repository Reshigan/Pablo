import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export type SidebarTab = 'sessions' | 'files' | 'search' | 'git' | 'memory' | 'checkpoints' | 'secrets';
export type WorkspaceTab = 'editor' | 'diff' | 'db-designer' | 'api-tester' | 'preview' | 'pipeline' | 'dependencies' | 'deploy-logs' | 'bugs' | 'terminal' | 'mission-control' | 'costs';

/**
 * Safe storage adapter — works in SSR, Workers, and browsers
 * Falls back to no-op if localStorage is unavailable
 */
const safeStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(name);
      }
    } catch {
      // localStorage blocked (e.g. Safari private mode)
    }
    return null;
  },
  setItem: (name: string, value: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(name, value);
      }
    } catch {
      // Storage full or blocked
    }
  },
  removeItem: (name: string): void => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(name);
      }
    } catch {
      // Ignore
    }
  },
};

interface UIState {
  // Sidebar
  sidebarOpen: boolean;
  sidebarTab: SidebarTab;
  sidebarWidth: number;

  // Chat
  chatOpen: boolean;
  chatWidth: number;

  // Workspace
  activeWorkspaceTab: WorkspaceTab;

  // Command palette
  commandPaletteOpen: boolean;

  // Settings
  settingsOpen: boolean;

  // Auto-preview trigger
  autoStartPreview: boolean;

  // Mobile responsive (Task 30)
  mobileMode: boolean;
  tabletMode: boolean;

  // Iteration settings (Autonomy Spec)
  autoIterateEnabled: boolean;
  iterationTargetScore: number;

  // Actions
  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSidebarWidth: (width: number | ((prev: number) => number)) => void;
  toggleChat: () => void;
  setChatWidth: (width: number | ((prev: number) => number)) => void;
  toggleTerminal: () => void;
  setActiveWorkspaceTab: (tab: WorkspaceTab) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
  setAutoStartPreview: (v: boolean) => void;
  setMobileMode: (v: boolean) => void;
  setTabletMode: (v: boolean) => void;
  setAutoIterate: (enabled: boolean) => void;
  setIterationTargetScore: (score: number) => void;
}

export const useUIStore = create<UIState>()(
  persist(
    (set) => ({
      // Sidebar
      sidebarOpen: true,
      sidebarTab: 'files',
      sidebarWidth: 260,

      // Chat
      chatOpen: true,
      chatWidth: 420,

      // Workspace
      activeWorkspaceTab: 'editor',

      // Command palette
      commandPaletteOpen: false,

      // Settings
      settingsOpen: false,

      // Auto-preview
      autoStartPreview: false,

      // Mobile responsive (Task 30)
      mobileMode: false,
      tabletMode: false,

      // Iteration settings (Autonomy Spec)
      autoIterateEnabled: false,
      iterationTargetScore: 95,

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      setSidebarWidth: (width) => set((state) => ({ sidebarWidth: Math.max(200, Math.min(500, typeof width === 'function' ? width(state.sidebarWidth) : width)) })),
      toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
      setChatWidth: (width) => set((state) => ({ chatWidth: Math.max(380, Math.min(800, typeof width === 'function' ? width(state.chatWidth) : width)) })),
      toggleTerminal: () => set((state) => ({
        activeWorkspaceTab: state.activeWorkspaceTab === 'terminal' ? 'editor' : 'terminal',
      })),
      setActiveWorkspaceTab: (tab) => set({ activeWorkspaceTab: tab }),
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
      setAutoStartPreview: (v) => set({ autoStartPreview: v }),
      setMobileMode: (v) => set({ mobileMode: v }),
      setTabletMode: (v) => set({ tabletMode: v }),
      setAutoIterate: (enabled) => set({ autoIterateEnabled: enabled }),
      setIterationTargetScore: (score) => set({ iterationTargetScore: Math.max(70, Math.min(100, score)) }),
    }),
    {
      name: 'pablo-ui-settings',
      storage: createJSONStorage(() => safeStorage),
      // Only persist layout preferences, not transient state
      partialize: (state) => ({
        sidebarOpen: state.sidebarOpen,
        sidebarTab: state.sidebarTab,
        sidebarWidth: state.sidebarWidth,
        chatOpen: state.chatOpen,
        chatWidth: state.chatWidth,
        activeWorkspaceTab: state.activeWorkspaceTab,
        autoIterateEnabled: state.autoIterateEnabled,
        iterationTargetScore: state.iterationTargetScore,
      }),
    },
  ),
);
