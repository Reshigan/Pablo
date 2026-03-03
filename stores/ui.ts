import { create } from 'zustand';
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware';

export type SidebarTab = 'files' | 'search' | 'git' | 'memory' | 'metrics' | 'mcp';
export type WorkspaceTab = 'editor' | 'diff' | 'db-designer' | 'api-tester' | 'preview' | 'pipeline';

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

  // Terminal
  terminalOpen: boolean;
  terminalHeight: number;

  // Workspace
  activeWorkspaceTab: WorkspaceTab;

  // Command palette
  commandPaletteOpen: boolean;

  // Settings
  settingsOpen: boolean;

  // Actions
  toggleSidebar: () => void;
  setSidebarTab: (tab: SidebarTab) => void;
  setSidebarWidth: (width: number) => void;
  toggleChat: () => void;
  setChatWidth: (width: number) => void;
  toggleTerminal: () => void;
  setTerminalHeight: (height: number) => void;
  setActiveWorkspaceTab: (tab: WorkspaceTab) => void;
  toggleCommandPalette: () => void;
  toggleSettings: () => void;
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

      // Terminal
      terminalOpen: true,
      terminalHeight: 200,

      // Workspace
      activeWorkspaceTab: 'editor',

      // Command palette
      commandPaletteOpen: false,

      // Settings
      settingsOpen: false,

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
      setSidebarTab: (tab) => set({ sidebarTab: tab }),
      setSidebarWidth: (width) => set({ sidebarWidth: Math.max(200, Math.min(500, width)) }),
      toggleChat: () => set((state) => ({ chatOpen: !state.chatOpen })),
      setChatWidth: (width) => set({ chatWidth: Math.max(380, Math.min(800, width)) }),
      toggleTerminal: () => set((state) => ({ terminalOpen: !state.terminalOpen })),
      setTerminalHeight: (height) => set({ terminalHeight: Math.max(100, Math.min(600, height)) }),
      setActiveWorkspaceTab: (tab) => set({ activeWorkspaceTab: tab }),
      toggleCommandPalette: () => set((state) => ({ commandPaletteOpen: !state.commandPaletteOpen })),
      toggleSettings: () => set((state) => ({ settingsOpen: !state.settingsOpen })),
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
        terminalOpen: state.terminalOpen,
        terminalHeight: state.terminalHeight,
        activeWorkspaceTab: state.activeWorkspaceTab,
      }),
    },
  ),
);
