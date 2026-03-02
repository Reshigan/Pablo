'use client';

import {
  Globe,
  RefreshCw,
  ExternalLink,
  Smartphone,
  Monitor,
  Tablet,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useState, useCallback } from 'react';

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_SIZES: Record<ViewportSize, { width: string; icon: typeof Monitor; label: string }> = {
  desktop: { width: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { width: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { width: '375px', icon: Smartphone, label: 'Mobile' },
};

export function LivePreview() {
  const [url, setUrl] = useState('');
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [isLoading, setIsLoading] = useState(false);
  const [hasPreview, setHasPreview] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);

  const navigate = useCallback((newUrl: string) => {
    if (!newUrl.trim()) return;
    let fullUrl = newUrl;
    if (!fullUrl.startsWith('http://') && !fullUrl.startsWith('https://')) {
      fullUrl = `https://${fullUrl}`;
    }
    setUrl(fullUrl);
    setIsLoading(true);
    setHasPreview(true);
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), fullUrl]);
    setHistoryIndex((prev) => prev + 1);
    // Simulate load complete
    setTimeout(() => setIsLoading(false), 1000);
  }, [historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      setUrl(history[newIndex]);
    }
  }, [historyIndex, history]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      setUrl(history[newIndex]);
    }
  }, [historyIndex, history]);

  const refresh = useCallback(() => {
    setIsLoading(true);
    setTimeout(() => setIsLoading(false), 500);
  }, []);

  const viewportConfig = VIEWPORT_SIZES[viewport];

  if (!hasPreview) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-pablo-bg text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold/10">
          <Globe size={32} className="text-pablo-gold" />
        </div>
        <p className="font-ui text-sm font-medium text-pablo-text-dim">Live Preview</p>
        <p className="max-w-xs font-ui text-xs text-pablo-text-muted leading-relaxed">
          Preview your application in real-time. Enter a URL or start a dev server to see changes instantly.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="http://localhost:3000"
              className="flex-1 rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 font-code text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(url);
              }}
            />
            <button
              onClick={() => navigate(url)}
              disabled={!url.trim()}
              className="rounded-lg bg-pablo-gold px-3 py-2 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim disabled:opacity-30"
            >
              Go
            </button>
          </div>
          <div className="flex items-center gap-1 justify-center">
            {(['desktop', 'tablet', 'mobile'] as ViewportSize[]).map((vp) => {
              const config = VIEWPORT_SIZES[vp];
              const Icon = config.icon;
              return (
                <button
                  key={vp}
                  onClick={() => setViewport(vp)}
                  className={`flex items-center gap-1 rounded px-2 py-1 font-ui text-[10px] transition-colors ${
                    viewport === vp
                      ? 'bg-pablo-gold/20 text-pablo-gold'
                      : 'text-pablo-text-muted hover:bg-pablo-hover'
                  }`}
                >
                  <Icon size={12} />
                  {config.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* Browser chrome */}
      <div className="flex items-center gap-1 border-b border-pablo-border bg-pablo-panel px-2 py-1">
        {/* Navigation buttons */}
        <button
          onClick={goBack}
          disabled={historyIndex <= 0}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover disabled:opacity-30"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={goForward}
          disabled={historyIndex >= history.length - 1}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover disabled:opacity-30"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={refresh}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* URL bar */}
        <div className="flex flex-1 items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-0.5">
          <Globe size={10} className="mr-1 shrink-0 text-pablo-text-muted" />
          <input
            type="text"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(url);
            }}
            className="w-full bg-transparent font-code text-[11px] text-pablo-text outline-none"
          />
        </div>

        {/* Viewport switcher */}
        <div className="flex items-center gap-0.5 ml-1">
          {(['desktop', 'tablet', 'mobile'] as ViewportSize[]).map((vp) => {
            const config = VIEWPORT_SIZES[vp];
            const Icon = config.icon;
            return (
              <button
                key={vp}
                onClick={() => setViewport(vp)}
                className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                  viewport === vp ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'
                }`}
                title={config.label}
              >
                <Icon size={12} />
              </button>
            );
          })}
        </div>

        {/* External link */}
        <button
          onClick={() => window.open(url, '_blank')}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover"
          title="Open in browser"
        >
          <ExternalLink size={12} />
        </button>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="h-0.5 w-full bg-pablo-active">
          <div className="h-full animate-pulse bg-pablo-gold" style={{ width: '60%' }} />
        </div>
      )}

      {/* Preview frame */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-pablo-bg p-2">
        <div
          className="h-full rounded-lg border border-pablo-border bg-white transition-all duration-300"
          style={{ width: viewportConfig.width, maxWidth: '100%' }}
        >
          <iframe
            src={url}
            className="h-full w-full rounded-lg"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            title="Live Preview"
          />
        </div>
      </div>
    </div>
  );
}
