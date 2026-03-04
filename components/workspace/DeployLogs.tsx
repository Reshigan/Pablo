'use client';

/**
 * Feature 24: Deployment Logs
 * Show real-time deployment progress and past deployments.
 */

import { Rocket, CheckCircle2, XCircle, ExternalLink, Clock, Loader2 } from 'lucide-react';
import { useState } from 'react';

export interface DeployEntry {
  id: string;
  status: 'live' | 'preview' | 'failed';
  url: string;
  projectName: string;
  timestamp: number;
  log?: string;
}

// In-memory deploy history (shared across component instances)
const deployHistory: DeployEntry[] = [];

export function addDeployEntry(entry: DeployEntry) {
  deployHistory.unshift(entry);
  if (deployHistory.length > 50) deployHistory.pop();
}

export function DeployLogs() {
  const [entries] = useState(() => [...deployHistory]);

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const StatusIcon = ({ status }: { status: string }) => {
    switch (status) {
      case 'live':
        return <CheckCircle2 size={12} className="text-pablo-green" />;
      case 'preview':
        return <Clock size={12} className="text-pablo-gold" />;
      case 'failed':
        return <XCircle size={12} className="text-pablo-red" />;
      default:
        return <Loader2 size={12} className="animate-spin text-pablo-gold" />;
    }
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      <div className="flex items-center gap-2 border-b border-pablo-border px-4 py-2 shrink-0">
        <Rocket size={14} className="text-pablo-gold" />
        <span className="font-ui text-xs font-medium text-pablo-text">Deployments</span>
        <span className="ml-auto font-code text-[10px] text-pablo-text-muted">
          {entries.length} deploys
        </span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <Rocket size={36} className="text-pablo-text-muted" />
            <p className="font-ui text-sm text-pablo-text-dim">No deployments yet</p>
            <p className="font-ui text-xs text-pablo-text-muted">
              Deploy your project from the Pipeline or Git panel
            </p>
          </div>
        ) : (
          <div className="py-1">
            {entries.map((entry) => (
              <div
                key={entry.id}
                className="border-b border-pablo-border/50 px-4 py-2.5 transition-colors hover:bg-pablo-hover"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={entry.status} />
                  <span
                    className={`font-ui text-[11px] font-medium ${
                      entry.status === 'live'
                        ? 'text-pablo-green'
                        : entry.status === 'failed'
                        ? 'text-pablo-red'
                        : 'text-pablo-gold'
                    }`}
                  >
                    {entry.status === 'live' ? 'Live' : entry.status === 'preview' ? 'Preview' : 'Failed'}
                  </span>
                  <span className="font-code text-[10px] text-pablo-text-muted">{formatTime(entry.timestamp)}</span>
                </div>
                {entry.url && (
                  <a
                    href={entry.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 flex items-center gap-1 font-code text-[11px] text-pablo-gold hover:underline"
                  >
                    <ExternalLink size={10} />
                    {entry.url}
                  </a>
                )}
                {entry.log && (
                  <pre className="mt-1.5 max-h-20 overflow-auto rounded bg-pablo-panel px-2 py-1 font-code text-[10px] text-pablo-text-muted">
                    {entry.log}
                  </pre>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
