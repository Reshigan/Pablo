'use client';

import {
  Search,
  Command,
  Settings,
  GitBranch,
  User,
  LogOut,
} from 'lucide-react';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { StatusBadge, type AgentStatus } from '@/components/shared/StatusBadge';
import { useUIStore } from '@/stores/ui';
import { useRepoStore } from '@/stores/repo';

interface TopBarProps {
  agentStatus?: AgentStatus;
}

export function TopBar({
  agentStatus = 'idle',
}: TopBarProps) {
  const { toggleCommandPalette, toggleSettings } = useUIStore();
  const { selectedRepo, selectedBranch } = useRepoStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    if (!userMenuOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const repoName = selectedRepo?.name ?? 'No repo selected';
  const branchName = selectedRepo ? selectedBranch : '—';

  return (
    <header
      className="flex h-[44px] shrink-0 items-center justify-between border-b border-pablo-border bg-pablo-panel px-3"
      role="banner"
    >
      {/* Left section: Logo + Repo + Status */}
      <div className="flex items-center gap-3">
        {/* Logo */}
        <div className="flex items-center gap-1.5">
          <span className="font-ui text-base font-bold tracking-tight text-pablo-gold">
            PABLO
          </span>
        </div>

        {/* Separator */}
        <div className="h-4 w-px bg-pablo-border" />

        {/* Repo/Branch */}
        <div className="flex items-center gap-1.5 rounded-md bg-pablo-hover px-2 py-1">
          <GitBranch size={14} className="text-pablo-text-dim" />
          <span className="font-ui text-xs text-pablo-text-dim">
            {repoName}
          </span>
          <span className="font-ui text-xs text-pablo-text-muted">/</span>
          <span className="font-ui text-xs text-pablo-text">{branchName}</span>
        </div>

        {/* Status Badge */}
        <StatusBadge status={agentStatus} />
      </div>

      {/* Right section: Actions */}
      <div className="flex items-center gap-1">
        {/* Search */}
        <button
          onClick={toggleCommandPalette}
          className="flex h-8 w-8 items-center justify-center rounded-md text-pablo-text-dim transition-colors duration-150 hover:bg-pablo-hover hover:text-pablo-text"
          aria-label="Search"
        >
          <Search size={16} />
        </button>

        {/* Command Palette */}
        <button
          onClick={toggleCommandPalette}
          className="flex h-8 items-center gap-1.5 rounded-md px-2 text-pablo-text-dim transition-colors duration-150 hover:bg-pablo-hover hover:text-pablo-text"
          aria-label="Command Palette"
        >
          <Command size={14} />
          <span className="font-ui text-[11px]">Cmd+K</span>
        </button>

        {/* Settings */}
        <button
          onClick={toggleSettings}
          className="flex h-8 w-8 items-center justify-center rounded-md text-pablo-text-dim transition-colors duration-150 hover:bg-pablo-hover hover:text-pablo-text"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>

        {/* User avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen((prev) => !prev)}
            className="flex h-7 w-7 items-center justify-center rounded-full bg-pablo-gold/20 text-pablo-gold transition-colors duration-150 hover:bg-pablo-gold/30"
            aria-label="User menu"
          >
            <User size={14} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-md border border-pablo-border bg-pablo-panel shadow-lg">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  signOut({ callbackUrl: '/login' });
                }}
                className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left font-ui text-xs text-pablo-text-dim transition-colors duration-100 hover:bg-pablo-hover hover:text-pablo-red"
              >
                <LogOut size={14} />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
