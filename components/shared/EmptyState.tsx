'use client';

import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

/**
 * Task 43: Reusable empty state component for all panels.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-pablo-gold/8 border border-pablo-gold/10">
        <Icon size={20} className="text-pablo-gold/60" />
      </div>
      <h3 className="font-ui text-sm font-medium text-pablo-text-secondary">{title}</h3>
      <p className="max-w-[240px] font-ui text-xs text-pablo-text-muted">{description}</p>
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
