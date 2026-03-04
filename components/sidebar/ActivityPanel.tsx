'use client';

/**
 * Feature 21: Activity Feed / Change Log
 * Timeline of everything that happened in a session.
 */

import {
  Play,
  CheckCircle2,
  XCircle,
  FileCode2,
  GitCommit,
  Rocket,
  Bug,
  Wrench,
  Edit3,
  Save,
  RotateCcw,
  Search,
  Clock,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { useActivityStore, type ActivityType } from '@/stores/activity';

const ACTIVITY_ICONS: Record<ActivityType, typeof Play> = {
  pipeline_started: Play,
  pipeline_completed: CheckCircle2,
  pipeline_failed: XCircle,
  files_generated: FileCode2,
  diff_accepted: CheckCircle2,
  diff_rejected: XCircle,
  deploy_started: Rocket,
  deploy_completed: Rocket,
  deploy_failed: XCircle,
  error_detected: Bug,
  error_fixed: Wrench,
  manual_edit: Edit3,
  git_commit: GitCommit,
  checkpoint_created: Save,
  checkpoint_restored: RotateCcw,
  scan_completed: Search,
  prompt_enhanced: Sparkles,
  ai_review: MessageSquare,
};

const ACTIVITY_COLORS: Record<ActivityType, string> = {
  pipeline_started: 'text-pablo-gold',
  pipeline_completed: 'text-pablo-green',
  pipeline_failed: 'text-pablo-red',
  files_generated: 'text-pablo-blue',
  diff_accepted: 'text-pablo-green',
  diff_rejected: 'text-pablo-red',
  deploy_started: 'text-pablo-gold',
  deploy_completed: 'text-pablo-green',
  deploy_failed: 'text-pablo-red',
  error_detected: 'text-pablo-red',
  error_fixed: 'text-pablo-green',
  manual_edit: 'text-pablo-text-dim',
  git_commit: 'text-pablo-blue',
  checkpoint_created: 'text-pablo-gold',
  checkpoint_restored: 'text-pablo-gold',
  scan_completed: 'text-pablo-blue',
  prompt_enhanced: 'text-purple-400',
  ai_review: 'text-purple-400',
};

export function ActivityPanel() {
  const { entries, clearEntries } = useActivityStore();

  const formatTime = (ts: number) => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    const hours = Math.floor(mins / 60);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pablo-border px-3 py-2 shrink-0">
        <span className="font-ui text-xs font-medium text-pablo-text">Activity</span>
        {entries.length > 0 && (
          <button
            onClick={clearEntries}
            className="font-ui text-[10px] text-pablo-text-muted hover:text-pablo-text transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="flex-1 overflow-y-auto">
        {entries.length === 0 ? (
          <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
            <Clock size={24} className="text-pablo-text-muted" />
            <p className="font-ui text-xs text-pablo-text-muted">No activity yet</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">
              Actions will appear here as you work
            </p>
          </div>
        ) : (
          <div className="py-1">
            {entries.map((entry) => {
              const Icon = ACTIVITY_ICONS[entry.type] || Clock;
              const color = ACTIVITY_COLORS[entry.type] || 'text-pablo-text-muted';

              return (
                <div
                  key={entry.id}
                  className="flex items-start gap-2 border-b border-pablo-border/30 px-3 py-1.5 transition-colors hover:bg-pablo-hover"
                >
                  <Icon size={12} className={`mt-0.5 shrink-0 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-[11px] text-pablo-text-dim leading-tight">
                      {entry.message}
                    </p>
                    <span className="font-code text-[9px] text-pablo-text-muted">
                      {formatTime(entry.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
