import { create } from 'zustand';

export interface FileTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
}

interface EditorState {
  tabs: FileTab[];
  activeTabId: string | null;

  // Actions
  openFile: (file: Omit<FileTab, 'isDirty'>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  markClean: (id: string) => void;
}

function detectLanguage(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const langMap: Record<string, string> = {
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    md: 'markdown',
    css: 'css',
    scss: 'scss',
    html: 'html',
    py: 'python',
    rs: 'rust',
    go: 'go',
    sql: 'sql',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    dockerfile: 'dockerfile',
    xml: 'xml',
    svg: 'xml',
    graphql: 'graphql',
    prisma: 'prisma',
  };
  return langMap[ext] ?? 'plaintext';
}

export const useEditorStore = create<EditorState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  openFile: (file) => {
    const { tabs } = get();
    const existing = tabs.find((t) => t.path === file.path);
    if (existing) {
      set({ activeTabId: existing.id });
      return;
    }

    const language = file.language || detectLanguage(file.name);
    const newTab: FileTab = { ...file, language, isDirty: false };
    set({
      tabs: [...tabs, newTab],
      activeTabId: newTab.id,
    });
  },

  closeTab: (id) => {
    const { tabs, activeTabId } = get();
    const filtered = tabs.filter((t) => t.id !== id);
    let newActiveId = activeTabId;

    if (activeTabId === id) {
      const idx = tabs.findIndex((t) => t.id === id);
      if (filtered.length > 0) {
        newActiveId = filtered[Math.min(idx, filtered.length - 1)].id;
      } else {
        newActiveId = null;
      }
    }

    set({ tabs: filtered, activeTabId: newActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateContent: (id, content) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, content, isDirty: true } : t
      ),
    })),

  markClean: (id) =>
    set((state) => ({
      tabs: state.tabs.map((t) =>
        t.id === id ? { ...t, isDirty: false } : t
      ),
    })),
}));
