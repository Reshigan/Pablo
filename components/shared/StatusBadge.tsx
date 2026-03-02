'use client';

export type AgentStatus = 'idle' | 'thinking' | 'coding' | 'testing' | 'reviewing' | 'error' | 'offline' | 'connected';

const statusConfig: Record<AgentStatus, { label: string; dotColor: string; bgColor: string; textColor: string }> = {
  idle: {
    label: 'Idle',
    dotColor: 'bg-pablo-text-muted',
    bgColor: 'bg-pablo-hover',
    textColor: 'text-pablo-text-dim',
  },
  thinking: {
    label: 'Thinking...',
    dotColor: 'bg-pablo-gold',
    bgColor: 'bg-pablo-gold-bg',
    textColor: 'text-pablo-gold',
  },
  coding: {
    label: 'Coding',
    dotColor: 'bg-pablo-blue',
    bgColor: 'bg-pablo-blue/10',
    textColor: 'text-pablo-blue',
  },
  testing: {
    label: 'Testing',
    dotColor: 'bg-pablo-orange',
    bgColor: 'bg-pablo-orange/10',
    textColor: 'text-pablo-orange',
  },
  reviewing: {
    label: 'Reviewing',
    dotColor: 'bg-pablo-purple',
    bgColor: 'bg-pablo-purple-bg',
    textColor: 'text-pablo-purple',
  },
  error: {
    label: 'Error',
    dotColor: 'bg-pablo-red',
    bgColor: 'bg-pablo-red/10',
    textColor: 'text-pablo-red',
  },
  offline: {
    label: 'Offline',
    dotColor: 'bg-pablo-red',
    bgColor: 'bg-pablo-hover',
    textColor: 'text-pablo-text-muted',
  },
  connected: {
    label: 'Connected',
    dotColor: 'bg-pablo-green',
    bgColor: 'bg-pablo-green/10',
    textColor: 'text-pablo-green',
  },
};

interface StatusBadgeProps {
  status: AgentStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <div
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${config.bgColor} ${config.textColor} ${className}`}
      role="status"
      aria-live="polite"
      aria-label={`Agent status: ${config.label}`}
    >
      <span
        className={`h-2 w-2 rounded-full ${config.dotColor} ${
          status === 'thinking' || status === 'coding' ? 'animate-pulse-gold' : ''
        }`}
      />
      <span className="font-ui text-[11px]">{config.label}</span>
    </div>
  );
}
