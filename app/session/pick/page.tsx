'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Clock, Play, CheckCircle2, Loader2 } from 'lucide-react';
import { PabloLogo } from '@/components/shared/PabloLogo';

interface SessionSummary {
  id: string;
  title: string;
  status: string;
  updatedAt: string;
  repoUrl?: string;
}

export default function SessionPickerPage() {
  const router = useRouter();
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/sessions')
      .then((r) => r.json())
      .then((data: SessionSummary[]) => {
        setSessions(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const handleNewSession = useCallback(async () => {
    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: 'Untitled Session' }),
      });
      const session = (await res.json()) as { id: string };
      router.push(`/session/${session.id}`);
    } catch {
      router.push('/session/new');
    }
  }, [router]);

  const activeSessions = sessions.filter((s) => s.status === 'active');
  const completedSessions = sessions.filter((s) => s.status === 'completed');

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-pablo-bg">
        <Loader2 size={24} className="animate-spin text-pablo-gold" />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center bg-pablo-bg px-4 py-12">
      <PabloLogo size="lg" animate />
      <h1 className="mt-4 font-ui text-xl font-bold text-pablo-text">Welcome back</h1>
      <p className="mt-1 font-ui text-sm text-pablo-text-muted">
        Pick up where you left off, or start something new
      </p>

      {/* New session button */}
      <button
        onClick={handleNewSession}
        className="mt-6 flex items-center gap-2 rounded-xl bg-pablo-gold px-6 py-3 font-ui text-sm font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim"
      >
        <Plus size={16} />
        New Session
      </button>

      {/* Active sessions */}
      {activeSessions.length > 0 && (
        <div className="mt-8 w-full max-w-lg">
          <h2 className="mb-3 font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-muted">
            Active Sessions
          </h2>
          <div className="flex flex-col gap-2">
            {activeSessions.map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/session/${s.id}`)}
                className="flex items-center gap-3 rounded-xl border border-pablo-border bg-pablo-panel p-3 text-left transition-all hover:border-pablo-gold/40 hover:bg-pablo-hover"
              >
                <Play size={14} className="shrink-0 text-green-400" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-ui text-sm font-medium text-pablo-text">
                    {s.title}
                  </p>
                  <p className="flex items-center gap-1 font-ui text-[10px] text-pablo-text-muted">
                    <Clock size={9} /> {new Date(s.updatedAt).toLocaleDateString()}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Completed sessions */}
      {completedSessions.length > 0 && (
        <div className="mt-6 w-full max-w-lg">
          <h2 className="mb-3 font-ui text-xs font-semibold uppercase tracking-wider text-pablo-text-muted">
            Completed
          </h2>
          <div className="flex flex-col gap-2">
            {completedSessions.slice(0, 5).map((s) => (
              <button
                key={s.id}
                onClick={() => router.push(`/session/${s.id}`)}
                className="flex items-center gap-3 rounded-xl border border-pablo-border bg-pablo-panel p-3 text-left transition-all hover:border-pablo-gold/40 hover:bg-pablo-hover"
              >
                <CheckCircle2 size={14} className="shrink-0 text-pablo-gold/60" />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-ui text-sm text-pablo-text-dim">{s.title}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
