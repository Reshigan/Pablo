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
  Archive,
  Search,
  MoreVertical,
  RotateCcw,
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
  completed: 'text-pablo-text-muted',
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
  onResume,
  onDelete,
  onArchive,
  onReopen,
}: {
  session: AppSession;
  isCurrent: boolean;
  onResume: () => void;
  onDelete: () => void;
  onArchive: () => void;
  onReopen: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const StatusIcon = STATUS_ICONS[session.status];
  const statusColor = STATUS_COLORS[session.status];

  // Close menu on outside click
  useEffect(() => {
    if (!menuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <div
      className={`group relative rounded-lg border px-3 py-2.5 transition-colors cursor-pointer ${
        isCurrent
          ? 'border-pablo-gold/40 bg-pablo-gold/5'
          : 'border-pablo-border bg-pablo-panel hover:border-pablo-gold/20 hover:bg-pablo-hover'
      }`}
      onClick={onResume}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onResume(); }}
    >
      <div className="flex items-start gap-2">
        <StatusIcon size={14} className={`mt-0.5 shrink-0 ${statusColor}`} />
        <div className="min-w-0 flex-1">
          <p className="font-ui text-xs font-medium text-pablo-text truncate">
            {session.title}
          </p>
          {session.repoFullName && (
            <div className="mt-0.5 flex items-center gap-1">
              <FolderGit2 size={10} className="text-pablo-text-muted shrink-0" />
              <span className="font-code text-[10px] text-pablo-text-muted truncate">
                {session.repoFullName}
              </span>
            </div>
          )}
          <div className="mt-1 flex items-center gap-2">
            <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-text-muted">
              <Clock size={9} />
              {formatTimeAgo(session.updatedAt)}
            </span>
            {isCurrent && (
              <span className="rounded-full bg-pablo-gold/20 px-1.5 py-0.5 font-ui text-[9px] font-medium text-pablo-gold">
                CURRENT
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
            }}
            className="rounded p-1 text-pablo-text-muted opacity-0 group-hover:opacity-100 hover:bg-pablo-gold/10 hover:text-pablo-gold transition-opacity"
            aria-label="Session actions"
            title="More actions"
          >
            <MoreVertical size={12} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-6 z-50 w-36 rounded-lg border border-pablo-border bg-pablo-panel shadow-lg py-1">
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
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  setMenuOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left font-ui text-[11px] text-red-400 hover:bg-red-500/10"
              >
                <Trash2 size={12} />
                Delete
              </button>
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
    archiveSession,
    saveSession,
  } = useSessionStore();

  // Phase 2.1: Status filter tabs
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('active');
  // ENH-4: Session search/filter
  const [searchQuery, setSearchQuery] = useState('');

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
      // Save current session before switching
      if (currentSessionId) {
        await saveSession().catch(() => { /* non-blocking */ });
      }
      router.push(`/session/${sessionId}`);
    },
    [currentSessionId, saveSession, router]
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
              onResume={() => handleResume(session.id)}
              onDelete={() => handleDelete(session.id)}
              onArchive={() => handleMarkComplete(session.id)}
              onReopen={() => handleReopen(session.id)}
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
