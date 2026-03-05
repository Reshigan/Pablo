import { create } from 'zustand';

export interface FileTab {
  id: string;
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
}

export interface DiffHunk {
  fileId: string;
  filename: string;
  language: string;
  oldContent: string;
  newContent: string;
  status: 'pending' | 'accepted' | 'rejected';
}

interface EditorState {
  tabs: FileTab[];
  activeTabId: string | null;
  pendingDiffs: DiffHunk[];

  // Actions
  openFile: (file: Omit<FileTab, 'isDirty'>) => void;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateContent: (id: string, content: string) => void;
  markClean: (id: string) => void;
  closeAllTabs: () => void;
  saveFile: (id: string) => Promise<void>;
  saveAllDirty: () => Promise<void>;
  addDiff: (diff: Omit<DiffHunk, 'status'>) => void;
  acceptDiff: (fileId: string) => void;
  rejectDiff: (fileId: string) => void;
  clearDiffs: () => void;
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
  pendingDiffs: [],

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

  closeAllTabs: () => set({ tabs: [], activeTabId: null }),

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

  saveFile: async (id) => {
    const tab = get().tabs.find((t) => t.id === id);
    if (!tab || !tab.isDirty) return;
    try {
      // Persist to in-memory DB (and later D1)
      const { getDB } = await import('@/lib/db/drizzle');
      const db = getDB();
      const existing = db.getFileByPath('default', tab.path);
      if (existing) {
        db.updateFile(existing.id, { content: tab.content });
      } else {
        db.createFile({
          sessionId: 'default',
          path: tab.path,
          name: tab.name,
          content: tab.content,
          language: tab.language,
        });
      }
      get().markClean(id);
    } catch {
      // Non-blocking — file stays dirty
    }
  },

  saveAllDirty: async () => {
    const dirtyTabs = get().tabs.filter((t) => t.isDirty);
    for (const tab of dirtyTabs) {
      await get().saveFile(tab.id);
    }
  },

  // AI-Apply Diff system — upsert: replace existing diff with same fileId, else append
  addDiff: (diff) =>
    set((state) => {
      const exists = state.pendingDiffs.some(d => d.fileId === diff.fileId);
      if (exists) {
        return {
          pendingDiffs: state.pendingDiffs.map(d =>
            d.fileId === diff.fileId ? { ...diff, status: 'pending' as const } : d
          ),
        };
      }
      return {
        pendingDiffs: [...state.pendingDiffs, { ...diff, status: 'pending' as const }],
      };
    }),

  acceptDiff: (fileId) => {
    const { pendingDiffs, tabs } = get();
    const diff = pendingDiffs.find((d) => d.fileId === fileId && d.status === 'pending');
    if (!diff) return;

    // Apply the new content to the matching tab (or open a new one)
    const existingTab = tabs.find((t) => t.path === diff.filename);
    if (existingTab) {
      get().updateContent(existingTab.id, diff.newContent);
    } else {
      const id = `diff-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      get().openFile({
        id,
        path: diff.filename,
        name: diff.filename.split('/').pop() || diff.filename,
        language: diff.language,
        content: diff.newContent,
      });
    }

    set((state) => ({
      pendingDiffs: state.pendingDiffs.map((d) =>
        d.fileId === fileId ? { ...d, status: 'accepted' } : d
      ),
    }));

    // Auto-save after accepting diff — always save regardless of isDirty
    // (new tabs from openFile start with isDirty: false even though content is new)
    const tabToSave = get().tabs.find((t) => t.path === diff.filename);
    if (tabToSave) {
      // Mark dirty first so saveFile doesn't skip it
      if (!tabToSave.isDirty) {
        set((state) => ({
          tabs: state.tabs.map((t) =>
            t.id === tabToSave.id ? { ...t, isDirty: true } : t
          ),
        }));
      }
      get().saveFile(tabToSave.id).catch(() => { /* non-blocking */ });
    }

    // Phase 4: Learn-on-Accept — capture pattern from accepted diff
    // REL-03: use dynamic import() inside an async IIFE (acceptDiff itself is sync)
    (async () => {
      try {
        const { useLearningStore } = await import('@/stores/learning');
        const learningStore = useLearningStore.getState();
        const ext = diff.filename.split('.').pop()?.toLowerCase() || '';
        const langTag = ext === 'ts' || ext === 'tsx' ? 'typescript'
          : ext === 'py' ? 'python'
          : ext === 'js' || ext === 'jsx' ? 'javascript'
          : ext;

        // Build a concise summary of what was accepted
        const oldLines = diff.oldContent.split('\n').length;
        const newLines = diff.newContent.split('\n').length;
        const summary = newLines > oldLines
          ? `Added ${newLines - oldLines} lines to ${diff.filename}`
          : oldLines > newLines
          ? `Removed ${oldLines - newLines} lines from ${diff.filename}`
          : `Modified ${diff.filename} (${newLines} lines)`;

        learningStore.addPattern({
          type: 'code_pattern',
          trigger: `User accepted code change in ${diff.filename}`,
          action: summary,
          context: diff.newContent.slice(0, 500),
          confidence: 0.7,
          tags: [langTag, 'user-accepted', diff.language],
        });
      } catch {
        // Non-blocking — don't fail the accept if learning fails
      }
    })();
  },

  rejectDiff: (fileId) =>
    set((state) => ({
      pendingDiffs: state.pendingDiffs.map((d) =>
        d.fileId === fileId ? { ...d, status: 'rejected' } : d
      ),
    })),

  clearDiffs: () => set({ pendingDiffs: [] }),
}));
