'use client';

import { useState, useRef, useCallback } from 'react';
import { Zap, Play, Paperclip, LayoutTemplate } from 'lucide-react';
import { usePipelineStore } from '@/stores/pipeline';

const TEMPLATES = [
  'SaaS Dashboard',
  'REST API',
  'Landing Page',
  'E-commerce Store',
  'Blog Platform',
  'Admin Panel',
];

/**
 * Task 40: Full-width hero prompt — shown when no files are open and no pipeline runs.
 */
export function HeroPrompt() {
  const [prompt, setPrompt] = useState('');
  const [showTemplates, setShowTemplates] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const setPendingPrompt = usePipelineStore(s => s.setPendingPrompt);

  const handleGenerate = useCallback(() => {
    const text = prompt.trim();
    if (!text) return;
    // Queue the prompt for PipelineView to pick up and execute the full 9-stage pipeline.
    // Previously this called startRun() which only created a run in the store
    // without executing any stages — the pipeline would appear "stuck at 0%".
    setPendingPrompt(text);
    setPrompt('');
  }, [prompt, setPendingPrompt]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        handleGenerate();
      }
    },
    [handleGenerate],
  );

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6 py-12">
      {/* Icon + heading */}
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-pablo-gold/10 border border-pablo-gold/15">
          <Zap size={28} className="text-pablo-gold" />
        </div>
        <h2 className="font-ui text-xl font-bold tracking-tight text-pablo-text">
          What shall we build?
        </h2>
        <p className="max-w-md font-ui text-sm text-pablo-text-dim leading-relaxed">
          Describe your feature and Pablo&apos;s 9-stage pipeline will plan, generate database schemas,
          APIs, UI components, tests, and review the code — all in one go.
        </p>
      </div>

      {/* Input area */}
      <div className="w-full max-w-2xl">
        <div className="rounded-xl border border-pablo-border bg-pablo-surface-1 focus-within:border-pablo-gold/30 focus-within:shadow-glow transition-all">
          <textarea
            ref={textareaRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Build a SaaS dashboard with user auth, billing via Stripe, and a team management page..."
            className="w-full resize-none rounded-t-xl bg-transparent px-4 pt-4 pb-2 font-ui text-sm text-pablo-text placeholder:text-pablo-text-muted outline-none min-h-[100px]"
            rows={4}
          />
          <div className="flex items-center justify-between border-t border-pablo-border/50 px-3 py-2">
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
              >
                <LayoutTemplate size={14} />
                Templates
              </button>
              <button className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim">
                <Paperclip size={14} />
                Attach
              </button>
            </div>
            <button
              onClick={handleGenerate}
              disabled={!prompt.trim()}
              className="flex items-center gap-1.5 rounded-lg bg-pablo-gold px-4 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-all hover:bg-pablo-gold/90 active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Play size={13} />
              Generate
            </button>
          </div>
        </div>

        {/* Quick-start templates */}
        {showTemplates && (
          <div className="mt-3 flex flex-wrap gap-2 justify-center animate-slide-in">
            {TEMPLATES.map((tpl) => (
              <button
                key={tpl}
                onClick={() => {
                  setPrompt(`Build a ${tpl.toLowerCase()}`);
                  setShowTemplates(false);
                  textareaRef.current?.focus();
                }}
                className="rounded-full border border-pablo-border bg-pablo-surface-2 px-3 py-1 font-ui text-xs text-pablo-text-dim transition-colors hover:border-pablo-gold/30 hover:text-pablo-gold"
              >
                {tpl}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Keyboard hint */}
      <p className="font-ui text-[10px] text-pablo-text-ghost">
        <kbd className="rounded border border-pablo-border bg-pablo-surface-0 px-1 py-0.5 font-code">&#8984;&#9166;</kbd>{' '}
        to generate &middot;{' '}
        <kbd className="rounded border border-pablo-border bg-pablo-surface-0 px-1 py-0.5 font-code">&#8984;K</kbd>{' '}
        to chat &middot;{' '}
        <kbd className="rounded border border-pablo-border bg-pablo-surface-0 px-1 py-0.5 font-code">&#8984;B</kbd>{' '}
        for files
      </p>
    </div>
  );
}
