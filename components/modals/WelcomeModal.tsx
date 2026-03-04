'use client';

import { useState, useEffect } from 'react';
import { X, Zap, Terminal, GitBranch, Keyboard } from 'lucide-react';

const ONBOARDED_KEY = 'pablo-onboarded';

export function WelcomeModal() {
  const [visible, setVisible] = useState(false);

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
        <div className="mb-4 text-center">
          <h2 className="font-ui text-xl font-bold text-pablo-gold">Welcome to Pablo IDE</h2>
          <p className="mt-1 font-ui text-sm text-pablo-text-dim">
            AI-powered IDE that builds full-stack apps from natural language
          </p>
        </div>

        {/* Quick start tips */}
        <div className="mb-5 space-y-3">
          <div className="flex items-start gap-3 rounded-lg bg-pablo-hover p-3">
            <Zap size={18} className="mt-0.5 shrink-0 text-pablo-gold" />
            <div>
              <p className="font-ui text-xs font-semibold text-pablo-text">Pipeline</p>
              <p className="font-ui text-[11px] text-pablo-text-muted">
                Describe what you want to build and Pablo generates a full project through 8 AI stages
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-pablo-hover p-3">
            <Terminal size={18} className="mt-0.5 shrink-0 text-pablo-gold" />
            <div>
              <p className="font-ui text-xs font-semibold text-pablo-text">Live Preview</p>
              <p className="font-ui text-[11px] text-pablo-text-muted">
                See your app running in real-time with WebContainers, Pyodide, or iframe preview
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3 rounded-lg bg-pablo-hover p-3">
            <GitBranch size={18} className="mt-0.5 shrink-0 text-pablo-gold" />
            <div>
              <p className="font-ui text-xs font-semibold text-pablo-text">Git Integration</p>
              <p className="font-ui text-[11px] text-pablo-text-muted">
                Connect your GitHub repos, commit changes, create PRs, and deploy to Cloudflare
              </p>
            </div>
          </div>
        </div>

        {/* Keyboard shortcuts */}
        <div className="mb-5 rounded-lg border border-pablo-border bg-pablo-bg p-3">
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

        {/* CTA */}
        <button
          onClick={dismiss}
          className="w-full rounded-lg bg-pablo-gold py-2 font-ui text-sm font-semibold text-pablo-bg transition-colors hover:bg-pablo-gold-dim"
        >
          Get Started
        </button>
      </div>
    </div>
  );
}
