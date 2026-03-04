'use client';

import { useState, useEffect } from 'react';
import { X, GitBranch, Rocket, Keyboard, ArrowRight } from 'lucide-react';
import { useUIStore } from '@/stores/ui';

const ONBOARDED_KEY = 'pablo-onboarded';

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);
  const { setSidebarTab } = useUIStore();

  useEffect(() => {
    try {
      if (typeof window !== 'undefined' && !localStorage.getItem(ONBOARDED_KEY)) {
        setVisible(true);
      }
    } catch {
      // localStorage blocked
    }
  }, []);

  const dismiss = () => {
    setVisible(false);
    try {
      localStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      // Ignore
    }
  };

  const handleExistingRepo = () => {
    dismiss();
    setSidebarTab('git');
  };

  const handleNewBuild = () => {
    dismiss();
    // Focus on chat for new build — auto-routing will detect "build" intent
  };

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-pablo-border bg-pablo-panel p-6 shadow-2xl">
        {/* Close button */}
        <button
          onClick={dismiss}
          className="absolute right-3 top-3 flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text"
        >
          <X size={16} />
        </button>

        {/* Header */}
        <div className="mb-5 text-center">
          <h2 className="font-ui text-xl font-bold text-pablo-gold">Welcome to Pablo IDE</h2>
          <p className="mt-1 font-ui text-sm text-pablo-text-dim">
            AI-powered IDE that builds full-stack apps from natural language
          </p>
        </div>

        {/* Two-path choice */}
        <div className="mb-5 grid grid-cols-2 gap-3">
          {/* Path 1: Existing repo */}
          <button
            onClick={handleExistingRepo}
            className="group flex flex-col items-center gap-3 rounded-xl border border-pablo-border bg-pablo-bg p-4 transition-all hover:border-pablo-gold/50 hover:bg-pablo-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10">
              <GitBranch size={24} className="text-pablo-gold" />
            </div>
            <div className="text-center">
              <p className="font-ui text-sm font-semibold text-pablo-text">Open Existing Repo</p>
              <p className="mt-1 font-ui text-[10px] text-pablo-text-muted">
                Connect a GitHub repo to evaluate, fix, or extend
              </p>
            </div>
            <ArrowRight size={14} className="text-pablo-text-muted transition-transform group-hover:translate-x-1 group-hover:text-pablo-gold" />
          </button>

          {/* Path 2: New build */}
          <button
            onClick={handleNewBuild}
            className="group flex flex-col items-center gap-3 rounded-xl border border-pablo-border bg-pablo-bg p-4 transition-all hover:border-pablo-gold/50 hover:bg-pablo-hover"
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-gold/10">
              <Rocket size={24} className="text-pablo-gold" />
            </div>
            <div className="text-center">
              <p className="font-ui text-sm font-semibold text-pablo-text">Build Something New</p>
              <p className="mt-1 font-ui text-[10px] text-pablo-text-muted">
                Describe your app and Pablo builds it through AI pipeline
              </p>
            </div>
            <ArrowRight size={14} className="text-pablo-text-muted transition-transform group-hover:translate-x-1 group-hover:text-pablo-gold" />
          </button>
        </div>

        {/* Keyboard shortcuts */}
        <div className="mb-4 rounded-lg border border-pablo-border bg-pablo-bg p-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Keyboard size={14} className="text-pablo-text-dim" />
            <span className="font-ui text-xs font-semibold text-pablo-text-dim">Keyboard Shortcuts</span>
          </div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-1">
            {[
              ['\u2318\u21E7P', 'Command Palette'],
              ['\u2318K', 'Inline AI Edit'],
              ['\u2318B', 'Toggle Sidebar'],
              ['\u2318J', 'Toggle Chat'],
              ['\u2318`', 'Toggle Terminal'],
              ['\u2318P', 'Toggle Preview'],
              ['\u2318D', 'Show Diff'],
              ['\u2318S', 'Save'],
            ].map(([key, label]) => (
              <div key={key} className="flex items-center justify-between">
                <span className="font-ui text-[10px] text-pablo-text-muted">{label}</span>
                <kbd className="rounded bg-pablo-active px-1.5 py-0.5 font-code text-[9px] text-pablo-text-dim">{key}</kbd>
              </div>
            ))}
          </div>
        </div>

        {/* Skip CTA */}
        <button
          onClick={dismiss}
          className="w-full rounded-lg bg-pablo-hover py-2 font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-active hover:text-pablo-text-dim"
        >
          Skip for now
        </button>
      </div>
    </div>
  );
}
