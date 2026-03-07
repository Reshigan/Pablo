import { create } from 'zustand';
import type { ChatMessage } from './chat';
import type { PipelineRun } from './pipeline';
import type { FileTab, DiffHunk } from './editor';
import type { GitHubRepo } from './repo';
import type { WorkspaceTab } from './ui';
import { toastSuccess, toastError } from './toast';

// REL-03: lazy store accessors to avoid circular deps
// Uses dynamic import() instead of require() for Workers ES-module compatibility.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let _chatStore: any, _pipelineStore: any, _editorStore: any, _repoStore: any, _uiStore: any;
async function getChatStore() { if (!_chatStore) { _chatStore = (await import('./chat')).useChatStore; } return _chatStore; }
async function getPipelineStore() { if (!_pipelineStore) { _pipelineStore = (await import('./pipeline')).usePipelineStore; } return _pipelineStore; }
async function getEditorStore() { if (!_editorStore) { _editorStore = (await import('./editor')).useEditorStore; } return _editorStore; }
async function getRepoStore() { if (!_repoStore) { _repoStore = (await import('./repo')).useRepoStore; } return _repoStore; }
async function getUIStore() { if (!_uiStore) { _uiStore = (await import('./ui')).useUIStore; } return _uiStore; }

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
  /** Active workspace tab (editor, pipeline, preview, etc.) */
  activeWorkspaceTab?: WorkspaceTab;
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
  /** Task 24: Last successful save timestamp for auto-save indicator */
  lastSavedAt: string | null;

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
  /** FIX-4: Archive a session (set status to completed, stop auto-save) */
  archiveSession: (id: string) => Promise<void>;
  /** Update session metadata (title, repo, status) */
  updateSessionMeta: (id: string, updates: Partial<Pick<AppSession, 'title' | 'repoFullName' | 'repoBranch' | 'status'>>) => Promise<boolean>;
  /** Set the current session ID without loading */
  setCurrentSessionId: (id: string | null) => void;
  /** Find existing session for a repo */
  findSessionByRepo: (repoFullName: string) => AppSession | undefined;
  /** Auto-title a session based on repo name */
  autoTitleFromRepo: (repoFullName: string) => void;
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

async function captureSnapshot(): Promise<SessionSnapshot> {
  // REL-03: use dynamic import() instead of require()
  const useChatStore = await getChatStore();
  const usePipelineStore = await getPipelineStore();
  const useEditorStore = await getEditorStore();
  const useRepoStore = await getRepoStore();
  const useUIStore = await getUIStore();

  const chat = useChatStore.getState();
  const pipeline = usePipelineStore.getState();
  const editor = useEditorStore.getState();
  const repo = useRepoStore.getState();
  const ui = useUIStore.getState();

  return {
    messages: chat.messages,
    pipelineRuns: pipeline.runs,
    editorTabs: editor.tabs,
    activeTabId: editor.activeTabId,
    pendingDiffs: editor.pendingDiffs,
    selectedRepo: repo.selectedRepo,
    selectedBranch: repo.selectedBranch,
    activeWorkspaceTab: ui.activeWorkspaceTab,
  };
}

async function restoreSnapshot(snapshot: SessionSnapshot): Promise<void> {
  const useChatStore = await getChatStore();
  const usePipelineStore = await getPipelineStore();
  const useEditorStore = await getEditorStore();
  const useRepoStore = await getRepoStore();

  // Restore chat (clear isStreaming to prevent leak from previous session)
  const chatStore = useChatStore.getState();
  chatStore.clearMessages();
  useChatStore.setState({ isStreaming: false });
  for (const msg of snapshot.messages) {
    chatStore.addMessage({ role: msg.role, content: msg.content, model: msg.model, tokens: msg.tokens });
  }

  // Restore pipeline runs (replace entire runs array)
  // Set activeRunId to the most recent run so EditorPanel shows PipelineView
  const lastRunId = snapshot.pipelineRuns.length > 0 ? snapshot.pipelineRuns[0].id : null;
  usePipelineStore.setState({ runs: snapshot.pipelineRuns, activeRunId: lastRunId });

  // Restore editor tabs
  useEditorStore.setState({
    tabs: snapshot.editorTabs,
    activeTabId: snapshot.activeTabId,
    pendingDiffs: snapshot.pendingDiffs,
  });

  // Restore repo selection (always clear first to prevent stale repo leak)
  useRepoStore.getState().clearRepo();
  if (snapshot.selectedRepo) {
    useRepoStore.setState({
      selectedRepo: snapshot.selectedRepo,
      selectedBranch: snapshot.selectedBranch,
    });
  }

  // Restore workspace tab (e.g. if user was on pipeline view)
  if (snapshot.activeWorkspaceTab) {
    const useUIStore = await getUIStore();
    useUIStore.setState({ activeWorkspaceTab: snapshot.activeWorkspaceTab });
  }
}

// ─── Clear all stores (for session isolation) ────────────────────────────────

async function clearAllStores(): Promise<void> {
  const useChatStore = await getChatStore();
  const usePipelineStore = await getPipelineStore();
  const useEditorStore = await getEditorStore();
  const useRepoStore = await getRepoStore();

  // Clear chat messages and state
  useChatStore.getState().clearMessages();
  useChatStore.setState({ isStreaming: false });

  // Clear pipeline runs
  usePipelineStore.setState({ runs: [], activeRunId: null });

  // Clear editor tabs and diffs
  useEditorStore.setState({ tabs: [], activeTabId: null, pendingDiffs: [] });

  // Clear repo selection (but keep the repos list so it doesn't need to reload)
  useRepoStore.getState().clearRepo();

  // Reset workspace tab to default (pipeline/Build) so previous session's tab doesn't leak
  const useUIStore = await getUIStore();
  useUIStore.setState({ activeWorkspaceTab: 'pipeline' });
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
  lastSavedAt: null,

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

      // Clear all stores so the new session starts fresh
      await clearAllStores();

      set((state) => ({
        sessions: [session, ...state.sessions],
        currentSessionId: session.id,
        isLoading: false,
      }));
      startAutoSave();
      toastSuccess('Session created', session.title);
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create session';
      set({ isLoading: false, error: msg });
      toastError('Session error', msg);
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
      toastError('Sessions', msg);
    }
  },

  loadSession: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`/api/sessions/${id}`);
      if (!res.ok) throw new Error(`Failed to load session: ${res.status}`);
      const session = mapApiSession(await res.json());

      // FIX 1 (Session UX): Atomic restore — if snapshot exists, restoreSnapshot
      // overwrites all store slices in one go (no clearAllStores flash).
      // Only clearAllStores when there's NO snapshot (truly fresh session).
      if (session.snapshot) {
        await restoreSnapshot(session.snapshot);
      } else {
        await clearAllStores();
      }

      set((state) => ({
        currentSessionId: session.id,
        sessions: state.sessions.map((s) => (s.id === id ? session : s)),
        isLoading: false,
      }));
      startAutoSave();
      toastSuccess('Session loaded', session.title);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load session';
      set({ isLoading: false, error: msg });
      toastError('Session error', msg);
    }
  },

  saveSession: async () => {
    const { currentSessionId, isSaving } = get();
    if (!currentSessionId || isSaving) return;

    // REL-05: capture sessionId before async work to prevent race condition
    // when user switches sessions while save is in-flight
    const savingSessionId = currentSessionId;
    set({ isSaving: true });
    try {
      const snapshot = await captureSnapshot();

      // Also capture repo info
      const useRepoStore = await getRepoStore();
      const repo = useRepoStore.getState();

      // REL-05: only save if we're still on the same session
      if (get().currentSessionId !== savingSessionId) {
        set({ isSaving: false });
        return; // Session switched during save — discard stale snapshot
      }

      const res = await fetch(`/api/sessions/${savingSessionId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot,
          repoFullName: repo.selectedRepo?.full_name ?? null,
          repoBranch: repo.selectedBranch,
        }),
      });
      if (res.ok) {
        // Update local session state with repo info so sidebar shows it immediately
        const repoFullName = repo.selectedRepo?.full_name ?? null;
        const repoBranch = repo.selectedBranch;
        set((state) => ({
          isSaving: false,
          lastSavedAt: new Date().toISOString(),
          sessions: state.sessions.map((s) =>
            s.id === savingSessionId
              ? { ...s, repoFullName: repoFullName ?? s.repoFullName, repoBranch: repoBranch ?? s.repoBranch }
              : s
          ),
        }));
      } else {
        set({ isSaving: false });
        toastError('Save failed', `Server returned ${res.status}`);
      }
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

  // FIX-4: Archive a session — marks as completed and stops auto-save
  archiveSession: async (id: string) => {
    const ok = await get().updateSessionMeta(id, { status: 'completed' });
    if (ok) {
      if (get().currentSessionId === id) {
        stopAutoSave();
      }
      toastSuccess('Session archived', 'Session marked as completed');
    } else {
      toastError('Archive failed', 'Could not archive session');
    }
  },

  updateSessionMeta: async (id, updates) => {
    try {
      const res = await fetch(`/api/sessions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates),
      });
      if (!res.ok) return false;
      const updated = mapApiSession(await res.json());
      set((state) => ({
        sessions: state.sessions.map((s) => (s.id === id ? updated : s)),
      }));
      return true;
    } catch {
      return false;
    }
  },

  setCurrentSessionId: (id) => {
    set({ currentSessionId: id });
    if (id) startAutoSave();
    else stopAutoSave();
  },

  findSessionByRepo: (repoFullName: string) => {
    return get().sessions.find((s) => s.repoFullName === repoFullName && s.status === 'active');
  },

  autoTitleFromRepo: (repoFullName: string) => {
    const { currentSessionId } = get();
    if (!currentSessionId) return;
    // Extract repo name from full_name (e.g. "owner/repo" -> "repo")
    const repoName = repoFullName.split('/').pop() ?? repoFullName;
    const title = `${repoName} session`;
    get().updateSessionMeta(currentSessionId, { title, repoFullName }).catch(() => { /* non-blocking */ });
  },

  clearError: () => set({ error: null }),
}));
