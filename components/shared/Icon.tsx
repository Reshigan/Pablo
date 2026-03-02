'use client';

import { type LucideIcon } from 'lucide-react';

interface IconProps {
  icon: LucideIcon;
  size?: number;
  className?: string;
  onClick?: () => void;
  ariaLabel?: string;
}

export function Icon({ icon: LucideIcon, size = 20, className = '', onClick, ariaLabel }: IconProps) {
  return (
    <LucideIcon
      size={size}
      className={className}
      onClick={onClick}
      aria-label={ariaLabel}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      } : undefined}
    />
  );
}
