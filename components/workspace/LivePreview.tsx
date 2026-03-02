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
  AlertTriangle,
} from 'lucide-react';
import { useState, useCallback, useRef } from 'react';

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_SIZES: Record<ViewportSize, { width: string; icon: typeof Monitor; label: string }> = {
  desktop: { width: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { width: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { width: '375px', icon: Smartphone, label: 'Mobile' },
};

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) return trimmed;
  return `https://${trimmed}`;
}

export function LivePreview() {
  const [inputUrl, setInputUrl] = useState('');
  const [activeUrl, setActiveUrl] = useState('');
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [iframeKey, setIframeKey] = useState(0);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const navigate = useCallback((rawUrl: string) => {
    const fullUrl = normalizeUrl(rawUrl);
    if (!fullUrl) return;
    setInputUrl(fullUrl);
    setActiveUrl(fullUrl);
    setIsLoading(true);
    setLoadError(false);
    setIframeKey((k) => k + 1);
    setHistory((prev) => [...prev.slice(0, historyIndex + 1), fullUrl]);
    setHistoryIndex((prev) => prev + 1);
  }, [historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1;
      setHistoryIndex(newIndex);
      const prevUrl = history[newIndex];
      setInputUrl(prevUrl);
      setActiveUrl(prevUrl);
      setIsLoading(true);
      setLoadError(false);
      setIframeKey((k) => k + 1);
    }
  }, [historyIndex, history]);

  const goForward = useCallback(() => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1;
      setHistoryIndex(newIndex);
      const nextUrl = history[newIndex];
      setInputUrl(nextUrl);
      setActiveUrl(nextUrl);
      setIsLoading(true);
      setLoadError(false);
      setIframeKey((k) => k + 1);
    }
  }, [historyIndex, history]);

  const refresh = useCallback(() => {
    if (!activeUrl) return;
    setIsLoading(true);
    setLoadError(false);
    setIframeKey((k) => k + 1);
  }, [activeUrl]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setLoadError(true);
  }, []);

  const viewportConfig = VIEWPORT_SIZES[viewport];

  if (!activeUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-pablo-bg text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold/10">
          <Globe size={32} className="text-pablo-gold" />
        </div>
        <p className="font-ui text-sm font-medium text-pablo-text-dim">Live Preview</p>
        <p className="max-w-xs font-ui text-xs text-pablo-text-muted leading-relaxed">
          Preview any web application in real-time. Enter a URL to load it in an embedded browser frame.
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="https://example.com"
              className="flex-1 rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 font-code text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(inputUrl);
              }}
            />
            <button
              onClick={() => navigate(inputUrl)}
              disabled={!inputUrl.trim()}
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
          <p className="font-ui text-[10px] text-pablo-text-muted mt-1">
            Note: Some sites block iframe embedding via X-Frame-Options headers. Use the external link button to open those in a new tab instead.
          </p>
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
          title="Refresh"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>

        {/* URL bar */}
        <div className="flex flex-1 items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-0.5">
          <Globe size={10} className="mr-1 shrink-0 text-pablo-text-muted" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') navigate(inputUrl);
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
          onClick={() => window.open(activeUrl, '_blank')}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover"
          title="Open in new tab"
        >
          <ExternalLink size={12} />
        </button>
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="h-0.5 w-full bg-pablo-active overflow-hidden">
          <div className="h-full bg-pablo-gold animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Error banner */}
      {loadError && (
        <div className="flex items-center gap-2 border-b border-pablo-border bg-pablo-red/10 px-3 py-1.5">
          <AlertTriangle size={12} className="shrink-0 text-pablo-red" />
          <p className="font-ui text-[11px] text-pablo-red">
            This site may have blocked iframe embedding.
          </p>
          <button
            onClick={() => window.open(activeUrl, '_blank')}
            className="ml-auto font-ui text-[10px] text-pablo-gold hover:underline"
          >
            Open in new tab
          </button>
        </div>
      )}

      {/* Preview frame */}
      <div className="flex flex-1 items-start justify-center overflow-auto bg-pablo-bg p-2">
        <div
          className="h-full rounded-lg border border-pablo-border bg-white transition-all duration-300"
          style={{ width: viewportConfig.width, maxWidth: '100%' }}
        >
          <iframe
            key={iframeKey}
            ref={iframeRef}
            src={activeUrl}
            className="h-full w-full rounded-lg"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
            title="Live Preview"
            onLoad={handleIframeLoad}
            onError={handleIframeError}
          />
        </div>
      </div>
    </div>
  );
}
