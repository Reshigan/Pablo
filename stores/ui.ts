import { create } from 'zustand';

export type SidebarTab = 'files' | 'search' | 'git' | 'memory' | 'metrics' | 'mcp';
export type WorkspaceTab = 'editor' | 'diff' | 'db-designer' | 'api-tester' | 'preview' | 'pipeline';

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

export const useUIStore = create<UIState>((set) => ({
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
}));
