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
  Code2,
  Eye,
  Rocket,
  Loader2,
} from 'lucide-react';
import { useState, useCallback, useRef, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';
import { useRepoStore } from '@/stores/repo';
import { toast } from '@/stores/toast';

type ViewportSize = 'desktop' | 'tablet' | 'mobile';
type PreviewMode = 'generated' | 'url';

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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Assemble HTML/CSS/JS from editor tabs into a single previewable HTML document.
 * If an HTML file exists, uses it as base and injects CSS/JS.
 * Otherwise wraps JS/CSS in a scaffold, or renders a code summary for backend files.
 */
function assemblePreviewHtml(tabs: Array<{ name: string; content: string; language: string; path: string }>): string | null {
  if (tabs.length === 0) return null;

  const htmlFiles = tabs.filter(t => t.name.endsWith('.html') || t.name.endsWith('.htm'));
  const cssFiles = tabs.filter(t => t.name.endsWith('.css') || t.name.endsWith('.scss'));
  const jsFiles = tabs.filter(t =>
    t.name.endsWith('.js') || t.name.endsWith('.jsx') ||
    t.name.endsWith('.ts') || t.name.endsWith('.tsx')
  );

  // If we have an HTML file, use it as the base and inject CSS/JS
  if (htmlFiles.length > 0) {
    let html = htmlFiles[0].content;

    if (cssFiles.length > 0) {
      const cssBlock = cssFiles.map(f => `<style>/* ${escapeHtml(f.name)} */\n${f.content.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n');
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${cssBlock}\n</head>`);
      } else if (html.includes('<body')) {
        html = html.replace('<body', `${cssBlock}\n<body`);
      } else {
        html = cssBlock + '\n' + html;
      }
    }

    if (jsFiles.length > 0) {
      const jsBlock = jsFiles.map(f => `<script>/* ${escapeHtml(f.name)} */\n${f.content.replace(/<\/script/gi, '<\\/script')}<\/script>`).join('\n');
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${jsBlock}\n</body>`);
      } else {
        html = html + '\n' + jsBlock;
      }
    }

    return html;
  }

  // No HTML — if we have CSS or JS, create a scaffold
  if (cssFiles.length > 0 || jsFiles.length > 0) {
    const cssBlock = cssFiles.map(f => `<style>/* ${escapeHtml(f.name)} */\n${f.content.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n');
    const jsBlock = jsFiles.map(f => `<script>/* ${escapeHtml(f.name)} */\n${f.content.replace(/<\/script/gi, '<\\/script')}<\/script>`).join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pablo Preview</title>
${cssBlock}
</head>
<body>
<div id="app"></div>
${jsBlock}
</body>
</html>`;
  }

  // Backend-only code — render a styled code summary
  const fileList = tabs.map(f => {
    const lines = f.content.split('\n').length;
    return `<div class="file">
      <div class="file-header">${escapeHtml(f.name)} <span class="lines">${lines} lines</span></div>
      <pre><code>${escapeHtml(f.content)}</code></pre>
    </div>`;
  }).join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Pablo - Generated Code Preview</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #0d1117; color: #e6edf3; padding: 16px; }
  h1 { font-size: 18px; font-weight: 600; margin-bottom: 4px; color: #f0c674; }
  .subtitle { font-size: 12px; color: #8b949e; margin-bottom: 16px; }
  .file { margin-bottom: 16px; border: 1px solid #30363d; border-radius: 8px; overflow: hidden; }
  .file-header { background: #161b22; padding: 8px 12px; font-size: 13px; font-weight: 500; color: #f0c674; border-bottom: 1px solid #30363d; display: flex; justify-content: space-between; align-items: center; }
  .lines { font-size: 11px; color: #8b949e; font-weight: 400; }
  pre { padding: 12px; overflow-x: auto; font-size: 12px; line-height: 1.5; background: #0d1117; }
  code { font-family: 'SF Mono', 'Fira Code', monospace; color: #e6edf3; }
</style>
</head>
<body>
<h1>Generated Code</h1>
<div class="subtitle">${tabs.length} file(s) generated by Pablo Pipeline</div>
${fileList}
</body>
</html>`;
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
  const [previewMode, setPreviewMode] = useState<PreviewMode>('generated');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  // Subscribe to editor tabs and pipeline runs for generated code preview
  const tabs = useEditorStore((s) => s.tabs);
  const runs = usePipelineStore((s) => s.runs);
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  const selectedBranch = useRepoStore((s) => s.selectedBranch);
  const [deploying, setDeploying] = useState(false);

  // Pipeline-generated files have 'pipe' prefix in id
  const generatedTabs = useMemo(
    () => tabs.filter((t) => t.id.startsWith('pipe')),
    [tabs]
  );

  // Assemble preview HTML from generated files, falling back to all open tabs
  const previewHtml = useMemo(() => {
    const sourceTabs = generatedTabs.length > 0 ? generatedTabs : tabs;
    return assemblePreviewHtml(sourceTabs);
  }, [generatedTabs, tabs]);

  const hasGeneratedContent = previewHtml !== null;
  const latestRun = runs.length > 0 ? runs[0] : null;

  const navigate = useCallback((rawUrl: string) => {
    const fullUrl = normalizeUrl(rawUrl);
    if (!fullUrl) return;
    setInputUrl(fullUrl);
    setActiveUrl(fullUrl);
    setIsLoading(true);
    setLoadError(false);
    setPreviewMode('url');
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
    if (previewMode === 'generated') {
      setIframeKey((k) => k + 1);
      return;
    }
    if (!activeUrl) return;
    setIsLoading(true);
    setLoadError(false);
    setIframeKey((k) => k + 1);
  }, [activeUrl, previewMode]);

  const handleIframeLoad = useCallback(() => {
    setIsLoading(false);
  }, []);

  const handleIframeError = useCallback(() => {
    setIsLoading(false);
    setLoadError(true);
  }, []);

  const switchToGenerated = useCallback(() => {
    setPreviewMode('generated');
    setActiveUrl('');
    setInputUrl('');
    setLoadError(false);
    setIframeKey((k) => k + 1);
  }, []);

  const switchToUrl = useCallback(() => {
    setPreviewMode('url');
  }, []);

  const handleDeploy = useCallback(async () => {
    const filesToDeploy = tabs.filter((t) => t.content && t.path);
    if (filesToDeploy.length === 0) {
      toast('No files to deploy', 'Open some files first.');
      return;
    }
    setDeploying(true);
    try {
      const response = await fetch('/api/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          files: filesToDeploy.map((t) => ({ path: t.path, content: t.content })),
          repo: selectedRepo?.full_name,
          branch: selectedBranch,
        }),
      });
      if (!response.ok) {
        const errData = (await response.json()) as { error?: string };
        throw new Error(errData.error ?? `HTTP ${response.status}`);
      }
      const data = (await response.json()) as { message: string; url: string };
      toast('Deployed!', data.message);
      if (data.url) window.open(data.url, '_blank');
    } catch (err) {
      toast('Deploy failed', err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setDeploying(false);
    }
  }, [tabs, selectedRepo, selectedBranch]);

  const viewportConfig = VIEWPORT_SIZES[viewport];

  // Show generated code preview when in generated mode and we have content
  const showingGeneratedPreview = previewMode === 'generated' && hasGeneratedContent;

  // Empty state: no generated content and no URL
  if (!showingGeneratedPreview && !activeUrl) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-pablo-bg text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold/10">
          <Globe size={32} className="text-pablo-gold" />
        </div>
        <p className="font-ui text-sm font-medium text-pablo-text-dim">Live Preview</p>
        <p className="max-w-xs font-ui text-xs text-pablo-text-muted leading-relaxed">
          {hasGeneratedContent
            ? 'Preview your generated code or enter a URL to load an external site.'
            : 'Use the Pipeline to generate code, then preview it here. Or enter a URL to load an external site.'}
        </p>
        <div className="flex flex-col gap-2 w-full max-w-xs">
          {hasGeneratedContent && (
            <button
              onClick={switchToGenerated}
              className="flex items-center justify-center gap-2 rounded-lg bg-pablo-gold px-4 py-2.5 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim"
            >
              <Eye size={14} />
              Preview Generated Code ({generatedTabs.length > 0 ? generatedTabs.length : tabs.length} files)
            </button>
          )}
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
          {latestRun && (
            <p className="font-ui text-[10px] text-pablo-text-muted mt-1">
              Latest pipeline: <span className={
                latestRun.status === 'completed' ? 'text-pablo-green' :
                latestRun.status === 'running' ? 'text-pablo-gold' :
                latestRun.status === 'failed' ? 'text-pablo-red' : 'text-pablo-text-muted'
              }>{latestRun.status}</span>
              {latestRun.status === 'running' && ' — preview will update when complete'}
            </p>
          )}
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
          disabled={previewMode === 'generated' || historyIndex <= 0}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover disabled:opacity-30"
        >
          <ChevronLeft size={14} />
        </button>
        <button
          onClick={goForward}
          disabled={previewMode === 'generated' || historyIndex >= history.length - 1}
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

        {/* Mode toggle: Build vs URL */}
        <div className="flex items-center gap-0.5 rounded-md border border-pablo-border bg-pablo-bg px-0.5 py-0.5 ml-1">
          <button
            onClick={switchToGenerated}
            disabled={!hasGeneratedContent}
            className={`flex items-center gap-1 rounded px-2 py-0.5 font-ui text-[10px] transition-colors ${
              previewMode === 'generated'
                ? 'bg-pablo-gold/20 text-pablo-gold'
                : 'text-pablo-text-muted hover:bg-pablo-hover'
            } disabled:opacity-30`}
            title="Preview generated code"
          >
            <Code2 size={10} />
            Build
          </button>
          <button
            onClick={switchToUrl}
            className={`flex items-center gap-1 rounded px-2 py-0.5 font-ui text-[10px] transition-colors ${
              previewMode === 'url'
                ? 'bg-pablo-gold/20 text-pablo-gold'
                : 'text-pablo-text-muted hover:bg-pablo-hover'
            }`}
            title="Browse external URL"
          >
            <Globe size={10} />
            URL
          </button>
        </div>

        {/* URL bar or generated info */}
        {previewMode === 'url' ? (
          <div className="flex flex-1 items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-0.5 ml-1">
            <Globe size={10} className="mr-1 shrink-0 text-pablo-text-muted" />
            <input
              type="text"
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') navigate(inputUrl);
              }}
              placeholder="Enter URL..."
              className="w-full bg-transparent font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted"
            />
          </div>
        ) : (
          <div className="flex flex-1 items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-0.5 ml-1">
            <Code2 size={10} className="mr-1 shrink-0 text-pablo-gold" />
            <span className="font-code text-[11px] text-pablo-text-muted">
              Generated Preview ({generatedTabs.length > 0 ? generatedTabs.length : tabs.length} files)
            </span>
          </div>
        )}

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
        {previewMode === 'url' && activeUrl && (
          <button
            onClick={() => window.open(activeUrl, '_blank')}
            className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover"
            title="Open in new tab"
          >
            <ExternalLink size={12} />
          </button>
        )}

        {/* Deploy button */}
        {hasGeneratedContent && (
          <button
            onClick={handleDeploy}
            disabled={deploying}
            className="flex items-center gap-1 rounded bg-pablo-green/10 px-2 py-0.5 ml-1 font-ui text-[10px] text-pablo-green transition-colors hover:bg-pablo-green/20 disabled:opacity-50"
            title="Deploy files to GitHub"
          >
            {deploying ? <Loader2 size={10} className="animate-spin" /> : <Rocket size={10} />}
            {deploying ? 'Deploying...' : 'Deploy'}
          </button>
        )}
      </div>

      {/* Loading bar */}
      {isLoading && (
        <div className="h-0.5 w-full bg-pablo-active overflow-hidden">
          <div className="h-full bg-pablo-gold animate-pulse" style={{ width: '60%' }} />
        </div>
      )}

      {/* Error banner */}
      {loadError && previewMode === 'url' && (
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
          {showingGeneratedPreview && previewHtml ? (
            <iframe
              key={`gen-${iframeKey}`}
              ref={iframeRef}
              srcDoc={previewHtml}
              className="h-full w-full rounded-lg"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              title="Generated Code Preview"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          ) : previewMode === 'url' && activeUrl ? (
            <iframe
              key={`url-${iframeKey}`}
              ref={iframeRef}
              src={activeUrl}
              className="h-full w-full rounded-lg"
              sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
              title="Live Preview"
              onLoad={handleIframeLoad}
              onError={handleIframeError}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="font-ui text-xs text-pablo-text-muted">Enter a URL to preview</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
