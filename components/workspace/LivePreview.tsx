'use client';

import {
  Globe,
  RefreshCw,
  Smartphone,
  Monitor,
  Tablet,
  Loader2,
  Terminal as TerminalIcon,
  Play,
} from 'lucide-react';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';
import { toast } from '@/stores/toast';
import {
  detectRuntime,
  type PreviewFile,
  type PreviewRuntime,
} from '@/lib/preview/runtimeManager';

type ViewportSize = 'desktop' | 'tablet' | 'mobile';

const VIEWPORT_SIZES: Record<ViewportSize, { width: string; icon: typeof Monitor; label: string }> = {
  desktop: { width: '100%', icon: Monitor, label: 'Desktop' },
  tablet: { width: '768px', icon: Tablet, label: 'Tablet' },
  mobile: { width: '375px', icon: Smartphone, label: 'Mobile' },
};

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Assemble static HTML from tabs (existing srcDoc logic) */
function assemblePreviewHtml(
  tabs: Array<{ name: string; content: string; language: string; path: string }>
): string | null {
  if (tabs.length === 0) return null;

  const htmlFiles = tabs.filter(t => t.name.endsWith('.html') || t.name.endsWith('.htm'));
  const cssFiles = tabs.filter(t => t.name.endsWith('.css'));
  const jsFiles = tabs.filter(t =>
    t.name.endsWith('.js') && !t.name.endsWith('.jsx') && !t.name.endsWith('.ts') && !t.name.endsWith('.tsx')
  );

  if (htmlFiles.length > 0) {
    let html = htmlFiles[0].content;
    if (cssFiles.length > 0) {
      const cssBlock = cssFiles.map(f =>
        `<style>/* ${escapeHtml(f.name)} */\n${f.content.replace(/<\/style/gi, '<\\/style')}</style>`
      ).join('\n');
      html = html.includes('</head>')
        ? html.replace('</head>', `${cssBlock}\n</head>`)
        : cssBlock + '\n' + html;
    }
    if (jsFiles.length > 0) {
      const jsBlock = jsFiles.map(f =>
        `<script>/* ${escapeHtml(f.name)} */\n${f.content.replace(/<\/script/gi, '<\\/script')}<\/script>`
      ).join('\n');
      html = html.includes('</body>')
        ? html.replace('</body>', `${jsBlock}\n</body>`)
        : html + '\n' + jsBlock;
    }
    return html;
  }

  if (cssFiles.length > 0 || jsFiles.length > 0) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
${cssFiles.map(f => `<style>${f.content}</style>`).join('\n')}
</head><body><div id="app"></div>
${jsFiles.map(f => `<script>${f.content}<\/script>`).join('\n')}
</body></html>`;
  }

  // Backend-only code — show code summary
  return `<!DOCTYPE html><html><head><style>
body{font-family:monospace;background:#0d1117;color:#e6edf3;padding:16px}
.file{margin-bottom:12px;border:1px solid #30363d;border-radius:6px;overflow:hidden}
.header{background:#161b22;padding:6px 10px;font-size:12px;color:#f0c674;border-bottom:1px solid #30363d}
pre{padding:10px;font-size:11px;overflow-x:auto;margin:0}
</style></head><body>
${tabs.map(f => `<div class="file"><div class="header">${escapeHtml(f.name)}</div><pre>${escapeHtml(f.content)}</pre></div>`).join('\n')}
</body></html>`;
}

export function LivePreview() {
  const [viewport, setViewport] = useState<ViewportSize>('desktop');
  const [runtime, setRuntime] = useState<PreviewRuntime>('srcdoc');
  const [serverUrl, setServerUrl] = useState<string>('');
  const [terminalLog, setTerminalLog] = useState<string>('');
  const [runtimeStatus, setRuntimeStatus] = useState<string>('idle');
  const [iframeKey, setIframeKey] = useState(0);
  const [showTerminal, setShowTerminal] = useState(false);
  const [pyodideOutput, setPyodideOutput] = useState<string>('');
  const terminalRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const tabs = useEditorStore((s) => s.tabs);
  const runs = usePipelineStore((s) => s.runs);

  // Convert editor tabs to PreviewFile format
  const previewFiles: PreviewFile[] = useMemo(
    () => tabs.filter(t => t.content).map(t => ({
      path: t.path,
      name: t.name,
      content: t.content,
      language: t.language,
    })),
    [tabs]
  );

  // Auto-detect runtime when files change
  useEffect(() => {
    if (previewFiles.length === 0) return;
    const detected = detectRuntime(previewFiles);
    setRuntime(detected);
  }, [previewFiles]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLog, pyodideOutput]);

  // Static HTML preview
  const previewHtml = useMemo(() => {
    if (runtime !== 'srcdoc') return null;
    return assemblePreviewHtml(tabs);
  }, [tabs, runtime]);

  const appendLog = useCallback((text: string) => {
    setTerminalLog(prev => prev + text);
  }, []);

  // Start WebContainer preview
  const startWebContainer = useCallback(async () => {
    setTerminalLog('');
    setServerUrl('');
    setShowTerminal(true);

    try {
      const { startPreview } = await import('@/lib/preview/webcontainerRuntime');
      await startPreview(previewFiles, {
        onTerminalOutput: appendLog,
        onServerReady: (url) => {
          setServerUrl(url);
          setIframeKey(k => k + 1);
        },
        onError: (err) => {
          appendLog(`\nError: ${err}\n`);
          toast('Preview Error', err);
        },
        onStatusChange: setRuntimeStatus,
      });
    } catch (err) {
      appendLog(`\nFailed to start WebContainer: ${err instanceof Error ? err.message : err}\n`);
      setRuntimeStatus('error');
    }
  }, [previewFiles, appendLog]);

  // Start Pyodide preview
  const startPyodide = useCallback(async () => {
    setPyodideOutput('');
    setShowTerminal(true);

    try {
      const { runPythonProject } = await import('@/lib/preview/pyodideRuntime');
      const pythonFiles = previewFiles.filter(f => f.name.endsWith('.py'));

      await runPythonProject(
        pythonFiles.map(f => ({ path: f.path, content: f.content })),
        {
          onOutput: (text) => setPyodideOutput(prev => prev + text),
          onError: (text) => setPyodideOutput(prev => prev + `[ERROR] ${text}`),
          onStatusChange: setRuntimeStatus,
        },
      );
    } catch (err) {
      setPyodideOutput(`Failed: ${err instanceof Error ? err.message : err}`);
      setRuntimeStatus('error');
    }
  }, [previewFiles]);

  const refresh = useCallback(() => {
    if (runtime === 'webcontainer') {
      startWebContainer();
    } else if (runtime === 'pyodide') {
      startPyodide();
    } else {
      setIframeKey(k => k + 1);
    }
  }, [runtime, startWebContainer, startPyodide]);

  // Suppress unused variable warning - runs is used for reactivity
  void runs;

  // Empty state
  if (previewFiles.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 bg-pablo-bg text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold/10">
          <Globe size={32} className="text-pablo-gold" />
        </div>
        <p className="font-ui text-sm font-medium text-pablo-text-dim">Live Preview</p>
        <p className="max-w-xs font-ui text-xs text-pablo-text-muted leading-relaxed">
          Use the Pipeline to generate code, then preview it here.
          Supports React, TypeScript, Python, and static HTML.
        </p>
      </div>
    );
  }

  const viewportConfig = VIEWPORT_SIZES[viewport];
  const isRunning = runtimeStatus === 'booting' || runtimeStatus === 'installing' || runtimeStatus === 'starting' || runtimeStatus === 'loading' || runtimeStatus === 'running';

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-1 border-b border-pablo-border bg-pablo-panel px-2 py-1">
        {/* Runtime indicator */}
        <div className="flex items-center gap-1 rounded-md border border-pablo-border bg-pablo-bg px-2 py-0.5">
          <span className={`h-1.5 w-1.5 rounded-full ${
            runtimeStatus === 'ready' || runtimeStatus === 'done' ? 'bg-pablo-green' :
            isRunning ? 'bg-pablo-gold animate-pulse' :
            runtimeStatus === 'error' ? 'bg-pablo-red' : 'bg-pablo-text-muted'
          }`} />
          <span className="font-code text-[10px] text-pablo-text-muted">
            {runtime === 'webcontainer' ? 'Node.js' : runtime === 'pyodide' ? 'Python' : 'Static'}
          </span>
        </div>

        {/* Run button */}
        {(runtime === 'webcontainer' || runtime === 'pyodide') && (
          <button
            onClick={runtime === 'webcontainer' ? startWebContainer : startPyodide}
            disabled={isRunning}
            className="flex items-center gap-1 rounded bg-pablo-green/10 px-2 py-0.5 font-ui text-[10px] text-pablo-green transition-colors hover:bg-pablo-green/20 disabled:opacity-50"
          >
            {isRunning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
            {isRunning ? runtimeStatus : 'Run'}
          </button>
        )}

        <button onClick={refresh}
          className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover">
          <RefreshCw size={12} />
        </button>

        {/* Toggle terminal */}
        <button
          onClick={() => setShowTerminal(s => !s)}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            showTerminal ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'
          }`}
        >
          <TerminalIcon size={12} />
        </button>

        <div className="flex-1" />

        {/* Viewport switcher */}
        {(['desktop', 'tablet', 'mobile'] as ViewportSize[]).map((vp) => {
          const config = VIEWPORT_SIZES[vp];
          const Icon = config.icon;
          return (
            <button key={vp} onClick={() => setViewport(vp)}
              className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
                viewport === vp ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'
              }`}>
              <Icon size={12} />
            </button>
          );
        })}
      </div>

      {/* Preview area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <div className={`flex items-start justify-center overflow-auto bg-pablo-bg p-2 ${showTerminal ? 'flex-1' : 'flex-1'}`}
          style={{ minHeight: showTerminal ? '50%' : '100%' }}>
          <div className="h-full rounded-lg border border-pablo-border bg-white transition-all duration-300"
            style={{ width: viewportConfig.width, maxWidth: '100%' }}>

            {/* WebContainer: show iframe pointing to dev server */}
            {runtime === 'webcontainer' && serverUrl ? (
              <iframe
                key={`wc-${iframeKey}`}
                ref={iframeRef}
                src={serverUrl}
                className="h-full w-full rounded-lg"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox"
                title="WebContainer Preview"
              />
            ) : runtime === 'webcontainer' && !serverUrl ? (
              <div className="flex h-full flex-col items-center justify-center gap-3">
                {isRunning ? (
                  <>
                    <Loader2 size={24} className="text-pablo-gold animate-spin" />
                    <p className="font-ui text-xs text-pablo-text-muted">{runtimeStatus}...</p>
                  </>
                ) : (
                  <>
                    <Play size={24} className="text-pablo-gold" />
                    <p className="font-ui text-xs text-pablo-text-muted">Click Run to start the dev server</p>
                  </>
                )}
              </div>
            ) : null}

            {/* Pyodide: show output */}
            {runtime === 'pyodide' ? (
              <div className="h-full overflow-auto bg-[#0d1117] p-4 rounded-lg">
                {pyodideOutput ? (
                  <pre className="font-code text-xs text-[#e6edf3] whitespace-pre-wrap">{pyodideOutput}</pre>
                ) : (
                  <div className="flex h-full items-center justify-center">
                    {isRunning ? (
                      <Loader2 size={24} className="text-pablo-gold animate-spin" />
                    ) : (
                      <p className="font-ui text-xs text-pablo-text-muted">Click Run to execute Python</p>
                    )}
                  </div>
                )}
              </div>
            ) : null}

            {/* srcDoc: existing static HTML preview */}
            {runtime === 'srcdoc' && previewHtml ? (
              <iframe
                key={`src-${iframeKey}`}
                ref={iframeRef}
                srcDoc={previewHtml}
                className="h-full w-full rounded-lg"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                title="Static Preview"
              />
            ) : runtime === 'srcdoc' && !previewHtml ? (
              <div className="flex h-full items-center justify-center">
                <p className="font-ui text-xs text-pablo-text-muted">No previewable content</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* Terminal output panel */}
        {showTerminal && (
          <div className="h-48 border-t border-pablo-border bg-[#0d1117] overflow-auto" ref={terminalRef}>
            <div className="flex items-center gap-1.5 border-b border-[#30363d] px-3 py-1">
              <TerminalIcon size={10} className="text-pablo-gold" />
              <span className="font-code text-[10px] text-pablo-text-muted">Output</span>
            </div>
            <pre className="p-3 font-code text-[11px] text-[#e6edf3] whitespace-pre-wrap leading-relaxed">
              {runtime === 'pyodide' ? pyodideOutput : terminalLog || 'No output yet. Click Run to start.\n'}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
