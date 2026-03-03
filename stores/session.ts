import { create } from 'zustand';
import type { ChatMessage } from './chat';
import type { PipelineRun } from './pipeline';
import type { FileTab, DiffHunk } from './editor';
import type { GitHubRepo } from './repo';

// ─── Session Types ────────────────────────────────────────────────────────────

export interface SessionSnapshot {
  /** Chat messages */
  messages: ChatMessage[];
  /** Pipeline runs */
  pipelineRuns: PipelineRun[];
  /** Open editor tabs */
  editorTabs: FileTab[];
  activeTabId: string | null;
  /** Pending diffs */
  pendingDiffs: DiffHunk[];
  /** Selected repo info */
  selectedRepo: GitHubRepo | null;
  selectedBranch: string;
}

export interface AppSession {
  id: string;
  title: string;
  repoFullName: string | null;
  repoBranch: string;
  status: 'active' | 'paused' | 'completed' | 'error';
  createdAt: string;
  updatedAt: string;
  /** Serialized snapshot of all stores */
  snapshot: SessionSnapshot | null;
}

interface SessionState {
  /** Currently loaded session */
  currentSessionId: string | null;
  /** All sessions (loaded from API) */
  sessions: AppSession[];
  /** Loading state */
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;

  // ─── Actions ──────────────────────────────────────────────────────────────

  /** Create a new session and navigate to it */
  createSession: (title?: string) => Promise<AppSession>;
  /** Load session list from API */
  loadSessions: () => Promise<void>;
  /** Load a specific session and restore its state */
  loadSession: (id: string) => Promise<void>;
  /** Save current session state to API (snapshot all stores) */
  saveSession: () => Promise<void>;
  /** Delete a session */
  deleteSession: (id: string) => Promise<void>;
  /** Update session metadata (title, repo, status) */
  updateSessionMeta: (id: string, updates: Partial<Pick<AppSession, 'title' | 'repoFullName' | 'repoBranch' | 'status'>>) => Promise<void>;
  /** Set the current session ID without loading */
  setCurrentSessionId: (id: string | null) => void;
  /** Clear error */
  clearError: () => void;
}

// ─── API response mapper ─────────────────────────────────────────────────────
// D1 returns { repoUrl, repo_branch, created_at, updated_at, ... }
// Client expects { repoFullName, repoBranch, createdAt, updatedAt, ... }

function mapApiSession(raw: Record<string, unknown>): AppSession {
  return {
    id: String(raw.id ?? ''),
    title: String(raw.title ?? 'Untitled Session'),
    repoFullName: raw.repoUrl != null ? String(raw.repoUrl) : (raw.repoFullName != null ? String(raw.repoFullName) : null),
    repoBranch: String(raw.repoBranch ?? raw.repo_branch ?? 'main'),
    status: (raw.status as AppSession['status']) ?? 'active',
    createdAt: String(raw.createdAt ?? raw.created_at ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? raw.updated_at ?? new Date().toISOString()),
    snapshot: (raw.snapshot as SessionSnapshot | null) ?? null,
  };
}

// ─── Snapshot helpers ─────────────────────────────────────────────────────────

function captureSnapshot(): SessionSnapshot {
  // Dynamic imports to avoid circular deps at module level
  const { useChatStore } = require('./chat') as typeof import('./chat');
  const { usePipelineStore } = require('./pipeline') as typeof import('./pipeline');
  const { useEditorStore } = require('./editor') as typeof import('./editor');
  const { useRepoStore } = require('./repo') as typeof import('./repo');

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
}

function restoreSnapshot(snapshot: SessionSnapshot): void {
  const { useChatStore } = require('./chat') as typeof import('./chat');
  const { usePipelineStore } = require('./pipeline') as typeof import('./pipeline');
  const { useEditorStore } = require('./editor') as typeof import('./editor');
  const { useRepoStore } = require('./repo') as typeof import('./repo');

  // Restore chat
  const chatStore = useChatStore.getState();
  chatStore.clearMessages();
  for (const msg of snapshot.messages) {
    chatStore.addMessage({ role: msg.role, content: msg.content, model: msg.model, tokens: msg.tokens });
  }

  // Restore pipeline runs (replace entire runs array)
  usePipelineStore.setState({ runs: snapshot.pipelineRuns, activeRunId: null });

  // Restore editor tabs
  useEditorStore.setState({
    tabs: snapshot.editorTabs,
    activeTabId: snapshot.activeTabId,
    pendingDiffs: snapshot.pendingDiffs,
  });

  // Restore repo selection
  if (snapshot.selectedRepo) {
    useRepoStore.setState({
      selectedRepo: snapshot.selectedRepo,
      selectedBranch: snapshot.selectedBranch,
    });
  }
}

// ─── Auto-save interval ──────────────────────────────────────────────────────

let autoSaveTimer: ReturnType<typeof setInterval> | null = null;

function startAutoSave() {
  stopAutoSave();
  autoSaveTimer = setInterval(() => {
    const { currentSessionId, isSaving } = useSessionStore.getState();
    if (currentSessionId && !isSaving) {
      useSessionStore.getState().saveSession().catch(() => { /* non-blocking */ });
    }
  }, 30_000); // Auto-save every 30 seconds
}

function stopAutoSave() {
  if (autoSaveTimer) {
    clearInterval(autoSaveTimer);
    autoSaveTimer = null;
  }
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const useSessionStore = create<SessionState>((set, get) => ({
  currentSessionId: null,
  sessions: [],
  isLoading: false,
  isSaving: false,
  error: null,

  createSession: async (title?: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title || 'Untitled Session' }),
      });
      if (!res.ok) throw new Error(`Failed to create session: ${res.status}`);
      const session = mapApiSession(await res.json());
      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSessionId: session.id,
        isLoading: false,
      }));
      startAutoSave();
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create session';
      set({ isLoading: false, error: msg });
      throw err;
    }
  },

  loadSessions: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch('/api/sessions');
      if (!res.ok) throw new Error(`Failed to load sessions: ${res.status}`);
      const rawSessions: Record<string, unknown>[] = await res.json();
      const sessions = rawSessions.map(mapApiSession);
      set({ sessions, isLoading: false });
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load sessions';
      set({ isLoading: false, error: msg });
    }
  },

  loadSession: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const session = mapApiSession(await res.json());

      // Restore snapshot if present
      if (session.snapshot) {
        restoreSnapshot(session.snapshot);
      }

      set((state) => ({
        currentSessionId: session.id,
        sessions: state.sessions.map((s) => (s.id === id ? session : s)),
        isLoading: false,
      }));
      startAutoSave();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session';
      set({ isLoading: false, error: msg });
    }
  },

  saveSession: async () => {
    const { currentSessionId, isSaving } = get();
    if (!currentSessionId || isSaving) return;

    set({ isSaving: true });
    try {
      const snapshot = captureSnapshot();

      // Also capture repo info
      const { useRepoStore } = require('./repo') as typeof import('./repo');
      const repo = useRepoStore.getState();

      await fetch(`/api/sessions/${currentSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot,
          repoFullName: repo.selectedRepo?.full_name ?? null,
          repoBranch: repo.selectedBranch,
        }),
      });
      set({ isSaving: false });
    } catch {
      set({ isSaving: false });
    }
  },

  deleteSession: async (id: string) => {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
      set((state) => ({
        sessions: state.sessions.filter((s) => s.id !== id),
        currentSessionId: state.currentSessionId === id ? null : state.currentSessionId,
      }));
      if (get().currentSessionId === null) {
        stopAutoSave();
      }
    } catch {
      // Non-blocking
    }
  },

  updateSessionMeta: async (id, updates) => {
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return;
      const updated = mapApiSession(await res.json());
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? updated : s)),
      }));
    } catch {
      // Non-blocking
    }
  },

  setCurrentSessionId: (id) => {
    set({ currentSessionId: id });
    if (id) startAutoSave();
    else stopAutoSave();
  },

  clearError: () => set({ error: null }),
}));
