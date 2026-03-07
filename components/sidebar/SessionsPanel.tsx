'use client';

import { useSessionStore, type AppSession } from '@/stores/session';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus,
  Clock,
  Trash2,
  FolderGit2,
  Loader2,
  RefreshCw,
  Play,
  Pause,
  CheckCircle2,
  AlertCircle,
  Search,
  MoreVertical,
  RotateCcw,
  FileCode2,
  Gauge,
  Pencil,
} from 'lucide-react';

type StatusFilter = 'all' | 'active' | 'completed';

const STATUS_ICONS = {
  active: Play,
  paused: Pause,
  completed: CheckCircle2,
  error: AlertCircle,
} as const;

const STATUS_COLORS = {
  active: 'text-green-400',
  paused: 'text-yellow-400',
  completed: 'text-amber-400',
  error: 'text-red-400',
} as const;

function formatTimeAgo(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}

function SessionItem({
  session,
  isCurrent,
  isLoadingThis,
  onResume,
  onDelete,
  onArchive,
  onReopen,
  onRename,
}: {
  session: AppSession;
  isCurrent: boolean;
  isLoadingThis: boolean;
  onResume: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onReopen: () => void;
  onRename: (newTitle: string) => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(session.title);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const renameRef = useRef<HTMLInputElement>(null);
  const StatusIcon = STATUS_ICONS[session.status];
  const statusColor = STATUS_COLORS[session.status];
  const isCompleted = session.status === 'completed';

  // FIX 2: Extract metadata from snapshot for rich cards
  const snapshot = session.snapshot;
  const fileCount = snapshot?.editorTabs?.length ?? 0;
  const pipelineScore = snapshot?.pipelineRuns?.[0]?.readinessScore?.score ?? null;
  const promptPreview = snapshot?.pipelineRuns?.[0]?.featureDescription
    ? (snapshot.pipelineRuns[0].featureDescription.length > 60
      ? snapshot.pipelineRuns[0].featureDescription.slice(0, 60) + '...'
      : snapshot.pipelineRuns[0].featureDescription)
    : null;

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
        setConfirmDelete(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  // FIX 3: Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming) renameRef.current?.focus();
  }, [isRenaming]);

  const handleRenameSubmit = () => {
    const trimmed = renameValue.trim();
    if (trimmed && trimmed !== session.title) {
      onRename(trimmed);
    }
    setIsRenaming(false);
  };

  return (
    <div
      className={`group relative rounded-lg border px-3 py-2.5 transition-all cursor-pointer ${
        isCurrent
          ? 'border-pablo-gold/40 bg-pablo-gold/5'
          : isCompleted
            ? 'border-amber-500/20 bg-amber-500/5 hover:border-amber-400/40 hover:bg-amber-500/10'
            : 'border-pablo-border bg-pablo-panel hover:border-pablo-gold/20 hover:bg-pablo-hover'
      }`}
      onClick={onResume}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onResume(); }}
      title={isCompleted && !isCurrent ? 'Click to reopen' : undefined}
    >
      {/* FIX 6: Loading spinner overlay when switching to this session */}
      {isLoadingThis && (
        <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg bg-pablo-panel/80 backdrop-blur-sm">
          <Loader2 size={16} className="animate-spin text-pablo-gold" />
        </div>
      )}
      <div className="flex items-start gap-2">
        <StatusIcon size={14} className={`mt-0.5 shrink-0 ${statusColor}`} />
        <div className="min-w-0 flex-1">
          {/* FIX 3: Inline rename */}
          {isRenaming ? (
            <input
              ref={renameRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (e.key === 'Enter') handleRenameSubmit();
                if (e.key === 'Escape') setIsRenaming(false);
              }}
              onBlur={handleRenameSubmit}
              onClick={(e) => e.stopPropagation()}
              className="w-full rounded border border-pablo-gold/50 bg-pablo-input px-1.5 py-0.5 font-ui text-xs text-pablo-text outline-none focus:border-pablo-gold"
            />
          ) : (
            <p className="font-ui text-xs font-medium text-pablo-text truncate">
              {session.title}
            </p>
          )}
          {/* FIX 2: Prompt preview */}
          {promptPreview && !isRenaming && (
            <p className="mt-0.5 font-ui text-[10px] text-pablo-text-muted truncate italic">
              &ldquo;{promptPreview}&rdquo;
            </p>
          )}
          {session.repoFullName && (
            <div className="mt-0.5 flex items-center gap-1">
              <FolderGit2 size={10} className="text-pablo-text-muted shrink-0" />
              <span className="font-code text-[10px] text-pablo-text-muted truncate">
                {session.repoFullName}
                {session.repoBranch && session.repoBranch !== 'main' && (
                  <span className="text-pablo-gold/70">:{session.repoBranch}</span>
                )}
              </span>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
              <Clock size={9} />
              {formatTimeAgo(session.updatedAt)}
            </span>
            {/* FIX 2: Rich metadata — file count */}
            {fileCount > 0 && (
              <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
                <FileCode2 size={9} />
                {fileCount} file{fileCount !== 1 ? 's' : ''}
              </span>
            )}
            {/* FIX 2: Rich metadata — pipeline score */}
            {pipelineScore !== null && (
              <span className={`flex items-center gap-0.5 font-code text-[10px] ${
                pipelineScore >= 80 ? 'text-pablo-green' : pipelineScore >= 50 ? 'text-pablo-gold' : 'text-pablo-red'
              }`}>
                <Gauge size={9} />
                {pipelineScore}%
              </span>
            )}
            {isCurrent && (
              <span className="rounded-full bg-pablo-gold/20 px-1.5 py-0.5 font-ui text-[9px] font-medium text-pablo-gold">
                CURRENT
              </span>
            )}
            {/* FIX 7: Completed sessions hint */}
            {isCompleted && !isCurrent && (
              <span className="font-ui text-[9px] text-amber-400/70">
                Click to reopen
              </span>
            )}
          </div>
        </div>
        {/* Kebab menu */}
        <div className="relative shrink-0" ref={menuRef}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen(!menuOpen);
              setConfirmDelete(false);
            }}
            className="rounded p-1 text-pablo-text-muted opacity-0 group-hover:opacity-100 hover:bg-pablo-gold/10 hover:text-pablo-gold transition-opacity"
            aria-label="Session actions"
            title="More actions"
          >
            <MoreVertical size={12} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-50 w-40 rounded-lg border border-pablo-border bg-pablo-panel shadow-lg py-1">
              {/* FIX 3: Rename action */}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setRenameValue(session.title);
                  setIsRenaming(true);
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[11px] text-pablo-text-dim hover:bg-pablo-hover"
              >
                <Pencil size={12} />
                Rename
              </button>
              {session.status !== 'completed' ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onArchive();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[11px] text-pablo-text-dim hover:bg-pablo-hover"
                >
                  <CheckCircle2 size={12} />
                  Mark done
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onReopen();
                    setMenuOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[11px] text-pablo-text-dim hover:bg-pablo-hover"
                >
                  <RotateCcw size={12} />
                  Reopen
                </button>
              )}
              {/* FIX 4: Two-click delete confirmation */}
              {!confirmDelete ? (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setConfirmDelete(true);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[11px] text-red-400 hover:bg-red-500/10"
                >
                  <Trash2 size={12} />
                  Delete
                </button>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                    setMenuOpen(false);
                    setConfirmDelete(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[11px] font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20"
                >
                  <Trash2 size={12} />
                  Confirm delete?
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function SessionsPanel() {
  const router = useRouter();
  const {
    sessions,
    currentSessionId,
    isLoading,
    loadSessions,
    createSession,
    deleteSession,
    saveSession,
    updateSessionMeta,
  } = useSessionStore();

  // Phase 2.1: Status filter tabs
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  // ENH-4: Session search/filter
  const [searchQuery, setSearchQuery] = useState('');
  // FIX 6: Track which session is currently being loaded
  const [loadingSessionId, setLoadingSessionId] = useState<string | null>(null);

  const filteredSessions = sessions.filter((s) => {
    // Status filter
    if (statusFilter === 'active' && s.status === 'completed') return false;
    if (statusFilter === 'completed' && s.status !== 'completed') return false;
    // Search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return s.title.toLowerCase().includes(q) || s.repoFullName?.toLowerCase().includes(q);
    }
    return true;
  });

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleNewSession = useCallback(async () => {
    // Save current session before creating new one
    if (currentSessionId) {
      await saveSession().catch(() => { /* non-blocking */ });
    }
    try {
      const session = await createSession();
      router.push(`/session/${session.id}`);
    } catch {
      // If API fails, navigate to /session/new which handles it
      router.push('/session/new');
    }
  }, [currentSessionId, saveSession, createSession, router]);

  const handleResume = useCallback(
    async (sessionId: string) => {
      if (sessionId === currentSessionId) return;
      // FIX 6: Show loading spinner on the clicked card
      setLoadingSessionId(sessionId);
      // Save current session before switching
      if (currentSessionId) {
        await saveSession().catch(() => { /* non-blocking */ });
      }
      router.push(`/session/${sessionId}`);
    },
    [currentSessionId, saveSession, router]
  );

  // FIX 3: Rename handler
  const handleRename = useCallback(
    async (sessionId: string, newTitle: string) => {
      await updateSessionMeta(sessionId, { title: newTitle });
    },
    [updateSessionMeta]
  );

  const handleDelete = useCallback(
    async (sessionId: string) => {
      await deleteSession(sessionId);
      // If we deleted the current session, create a new one
      if (sessionId === currentSessionId) {
        router.push('/session/new');
      }
    },
    [deleteSession, currentSessionId, router]
  );

  const handleMarkComplete = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'completed' }),
        });
        loadSessions();
      } catch (err) {
        console.warn('[SessionsPanel] Mark complete failed:', err);
      }
    },
    [loadSessions]
  );

  const handleReopen = useCallback(
    async (sessionId: string) => {
      try {
        await fetch(`/api/sessions/${sessionId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'active' }),
        });
        loadSessions();
      } catch (err) {
        console.warn('[SessionsPanel] Reopen failed:', err);
      }
    },
    [loadSessions]
  );

  return (
    <div className="flex flex-col gap-2 p-2">
      {/* New Session + Refresh */}
      <div className="flex gap-1.5">
        <button
          onClick={handleNewSession}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-pablo-gold px-3 py-1.5 font-ui text-[11px] font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim"
        >
          <Plus size={12} />
          New Session
        </button>
        <button
          onClick={() => loadSessions()}
          disabled={isLoading}
          className="flex items-center justify-center rounded-lg border border-pablo-border px-2 py-1.5 text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim disabled:opacity-30"
          aria-label="Refresh sessions"
          title="Refresh sessions"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* Phase 2.1: Filter tabs */}
      <div className="flex rounded-lg border border-pablo-border bg-pablo-panel overflow-hidden">
        {(['active', 'completed', 'all'] as StatusFilter[]).map((filter) => (
          <button
            key={filter}
            onClick={() => setStatusFilter(filter)}
            className={`flex-1 py-1 font-ui text-[10px] font-medium transition-colors ${
              statusFilter === filter
                ? 'bg-pablo-gold/20 text-pablo-gold'
                : 'text-pablo-text-muted hover:text-pablo-text-dim hover:bg-pablo-hover'
            }`}
          >
            {filter.charAt(0).toUpperCase() + filter.slice(1)}
          </button>
        ))}
      </div>

      {/* ENH-4: Session search */}
      {sessions.length > 3 && (
        <div className="relative px-0.5">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-pablo-text-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search sessions..."
            className="w-full rounded-lg border border-pablo-border bg-pablo-input pl-7 pr-2 py-1 font-ui text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          />
        </div>
      )}

      {/* Sessions list */}
      {isLoading && sessions.length === 0 ? (
        <div className="flex items-center justify-center py-6">
          <Loader2 size={16} className="animate-spin text-pablo-text-muted" />
        </div>
      ) : sessions.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <p className="font-ui text-[11px] text-pablo-text-muted">
            No sessions yet.
          </p>
          <p className="font-ui text-[10px] text-pablo-text-muted leading-relaxed">
            Create a session to start building. Your work is auto-saved and persists across page refreshes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {filteredSessions.map((session) => (
            <SessionItem
              key={session.id}
              session={session}
              isCurrent={session.id === currentSessionId}
              isLoadingThis={loadingSessionId === session.id}
              onResume={() => handleResume(session.id)}
              onDelete={() => handleDelete(session.id)}
              onArchive={() => handleMarkComplete(session.id)}
              onReopen={() => handleReopen(session.id)}
              onRename={(newTitle) => handleRename(session.id, newTitle)}
            />
          ))}
          {filteredSessions.length === 0 && (
            <p className="py-4 text-center font-ui text-[11px] text-pablo-text-muted">
              {searchQuery ? `No sessions match "${searchQuery}"` : `No ${statusFilter === 'all' ? '' : statusFilter} sessions`}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
