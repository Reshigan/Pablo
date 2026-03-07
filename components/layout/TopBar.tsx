'use client';

import {
  Search,
  Settings,
  User,
  LogOut,
  GitBranch,
} from 'lucide-react';
import { PabloLogo } from '@/components/shared/PabloLogo';
import { useState, useRef, useEffect } from 'react';
import { signOut } from 'next-auth/react';
import { useUIStore } from '@/stores/ui';
import { useRepoStore } from '@/stores/repo';
import { WorkspaceTabs } from '@/components/workspace/WorkspaceTabs';

export function TopBar() {
  const { toggleCommandPalette, toggleSettings } = useUIStore();
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectedBranch = useRepoStore((s) => s.selectedBranch);
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

  return (
    <header className="flex h-12 shrink-0 items-center justify-between border-b border-pablo-border bg-pablo-surface-0 px-4">
      {/* Left: Logo */}
      <div className="flex items-center gap-2 w-auto md:w-40 shrink-0">
        <PabloLogo size="sm" />
        <span className="font-ui text-sm font-bold tracking-tight text-pablo-text">
          PABLO
        </span>
      </div>

      {/* Centre: Unified search bar — icon-only on mobile, full on md+ */}
      <button
        onClick={toggleCommandPalette}
        className="flex h-8 items-center gap-2 rounded-lg border border-pablo-border bg-pablo-surface-1 px-3 text-left transition-all hover:border-pablo-border-hov hover:bg-pablo-surface-2 focus-visible:shadow-glow focus-visible:border-pablo-gold w-8 md:w-full md:max-w-md"
      >
        <Search size={14} className="text-pablo-text-muted shrink-0" />
        <span className="hidden md:inline flex-1 font-ui text-xs text-pablo-text-muted">
          Search or ask Pablo...
        </span>
        <kbd className="hidden md:inline rounded border border-pablo-border bg-pablo-surface-0 px-1.5 py-0.5 font-code text-[10px] text-pablo-text-muted">
          ⌘⇧P
        </kbd>
      </button>

      {/* Repo indicator — shows selected repo and branch */}
      {selectedRepo && (
        <div className="hidden md:flex items-center gap-1.5 rounded-lg border border-pablo-border bg-pablo-surface-1 px-2.5 py-1 mx-2 shrink-0">
          <GitBranch size={12} className="text-pablo-gold shrink-0" />
          <span className="font-code text-[11px] text-pablo-text-dim truncate max-w-[160px]">
            {selectedRepo.full_name}
          </span>
          <span className="font-code text-[10px] text-pablo-text-muted">
            :{selectedBranch}
          </span>
        </div>
      )}

      {/* Task 36: Pill tab switcher — right of search */}
      <div className="hidden md:flex">
        <WorkspaceTabs />
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-1 w-auto md:w-40 justify-end shrink-0">
        <button
          onClick={toggleSettings}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text"
          aria-label="Settings"
        >
          <Settings size={16} />
        </button>

        {/* User avatar + dropdown */}
        <div className="relative" ref={menuRef}>
          <button
            onClick={() => setUserMenuOpen(p => !p)}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-pablo-gold/10 text-pablo-gold transition-colors hover:bg-pablo-gold/20"
            aria-label="User menu"
          >
            <User size={14} />
          </button>

          {userMenuOpen && (
            <div className="absolute right-0 top-full z-50 mt-1 w-40 rounded-lg border border-pablo-border bg-pablo-surface-2 shadow-elevated animate-slide-in">
              <button
                onClick={() => {
                  setUserMenuOpen(false);
                  signOut({ callbackUrl: '/login' });
                }}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left font-ui text-xs text-pablo-text-dim transition-colors duration-100 hover:bg-pablo-hover hover:text-pablo-red"
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
