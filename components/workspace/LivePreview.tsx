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
  Wrench,
  Crosshair,
  CheckCircle2,
} from 'lucide-react';
import { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { useEditorStore } from '@/stores/editor';
import { usePipelineStore } from '@/stores/pipeline';
import { useUIStore } from '@/stores/ui';
import { toast } from '@/stores/toast';
import {
  detectRuntime,
  type PreviewFile,
  type PreviewRuntime,
} from '@/lib/preview/runtimeManager';
import { hasError, parseError } from '@/lib/agents/autoFixLoop';
import { PREVIEW_BRIDGE_SCRIPT } from '@/lib/preview/previewBridge';

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
    // Inject preview bridge script for inspect mode
    html = html.includes('</body>')
      ? html.replace('</body>', `${PREVIEW_BRIDGE_SCRIPT}\n</body>`)
      : html + '\n' + PREVIEW_BRIDGE_SCRIPT;
    return html;
  }

  if (cssFiles.length > 0 || jsFiles.length > 0) {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">
${cssFiles.map(f => `<style>${f.content.replace(/<\/style/gi, '<\\/style')}</style>`).join('\n')}
</head><body><div id="app"></div>
${jsFiles.map(f => `<script>${f.content.replace(/<\/script/gi, '<\\/script')}<\/script>`).join('\n')}
${PREVIEW_BRIDGE_SCRIPT}
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
${PREVIEW_BRIDGE_SCRIPT}
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
  const [isAutoFixing, setIsAutoFixing] = useState(false);
  const [inspectMode, setInspectMode] = useState(false);
  const [selectedElement, setSelectedElement] = useState<{ tagName: string; className: string; componentName?: string; selector: string } | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyResult, setVerifyResult] = useState<{ passed: boolean; errors: string[]; fixAttempts: number } | null>(null);
  const terminalRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const prevFilesRef = useRef<string>('');

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

  // Hot reload: write updated files to running WebContainer (Feature 1)
  useEffect(() => {
    if (runtime !== 'webcontainer' || runtimeStatus !== 'ready') return;
    const filesHash = JSON.stringify(previewFiles.map(f => ({ p: f.path, c: f.content })));
    if (prevFilesRef.current === filesHash) return;
    if (prevFilesRef.current === '') {
      prevFilesRef.current = filesHash;
      return; // Skip first render
    }
    prevFilesRef.current = filesHash;

    // Write changed files to WebContainer for HMR
    (async () => {
      try {
        const { writeFile } = await import('@/lib/preview/webcontainerRuntime');
        for (const file of previewFiles) {
          await writeFile(file.path, file.content);
        }
      } catch {
        // Non-blocking — HMR may fail silently
      }
    })();
  }, [previewFiles, runtime, runtimeStatus]);

  // Auto-scroll terminal
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
    }
  }, [terminalLog, pyodideOutput]);

  // Preview bridge: listen for element selection from iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === 'pablo:element:selected') {
        setSelectedElement(e.data.element);
        setInspectMode(false);
        // Notify iframe to stop inspect mode
        iframeRef.current?.contentWindow?.postMessage({ type: 'pablo:inspect:stop' }, '*');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const toggleInspect = useCallback(() => {
    const next = !inspectMode;
    setInspectMode(next);
    if (next) {
      setSelectedElement(null);
      // Inject bridge script and start inspect
      iframeRef.current?.contentWindow?.postMessage({ type: 'pablo:inspect:start' }, '*');
    } else {
      iframeRef.current?.contentWindow?.postMessage({ type: 'pablo:inspect:stop' }, '*');
    }
  }, [inspectMode]);

  // Static HTML preview
  const previewHtml = useMemo(() => {
    if (runtime !== 'srcdoc') return null;
    return assemblePreviewHtml(tabs);
  }, [tabs, runtime]);

  const appendLog = useCallback((text: string) => {
    setTerminalLog(prev => prev + text);
  }, []);

  // Check if terminal output has errors (for auto-fix button — Feature 3)
  const currentOutput = runtime === 'pyodide' ? pyodideOutput : terminalLog;
  const showAutoFix = currentOutput.length > 0 && hasError(currentOutput);

  // Start WebContainer preview
  const startWebContainer = useCallback(async () => {
    // WebContainers require HTTPS — warn on HTTP
    if (typeof window !== 'undefined' && window.location.protocol === 'http:') {
      toast(
        'HTTPS Required',
        'WebContainers require HTTPS. Use `next dev --experimental-https` for local dev, or deploy to Cloudflare.'
      );
      setRuntimeStatus('error');
      setTerminalLog('WebContainers require a secure context (HTTPS).\n\nOptions:\n  1. Run `next dev --experimental-https` for local dev\n  2. Deploy to Cloudflare Pages (production)\n');
      setShowTerminal(true);
      return;
    }

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

  // Issue 9: Consume autoStartPreview flag — auto-refresh preview when all diffs accepted
  const autoStartPreview = useUIStore(s => s.autoStartPreview);
  const setAutoStartPreview = useUIStore(s => s.setAutoStartPreview);
  useEffect(() => {
    if (!autoStartPreview || previewFiles.length === 0) return;
    setAutoStartPreview(false);
    if (runtime === 'webcontainer') {
      startWebContainer();
    } else if (runtime === 'pyodide') {
      startPyodide();
    } else {
      setIframeKey(k => k + 1);
    }
  }, [autoStartPreview, setAutoStartPreview, previewFiles.length, runtime, startWebContainer, startPyodide]);

  // Auto-fix handler (Feature 3)
  const handleAutoFix = useCallback(async () => {
    setIsAutoFixing(true);
    appendLog('\n--- Auto-Fix Loop Started ---\n');

    try {
      const { runAutoFixLoop } = await import('@/lib/agents/autoFixLoop');
      const editorStore = useEditorStore.getState();
      const files = editorStore.tabs
        .filter(t => t.content)
        .map(t => ({ path: t.path, content: t.content, language: t.language }));

      // Route fix through /api/chat (server-side) instead of calling external LLM directly
      const { parseError } = await import('@/lib/agents/autoFixLoop');
      const error = parseError(currentOutput);
      if (!error) {
        appendLog('[Auto-Fix] No parseable error found\n');
        return;
      }

      const targetFile = error.file
        ? files.find(f => f.path.endsWith(error.file!) || f.path === error.file)
        : files[0];

      if (!targetFile) {
        appendLog('[Auto-Fix] Could not identify file with error\n');
        return;
      }

      appendLog(`[Auto-Fix] Detected ${error.type} error in ${targetFile.path}: ${error.message}\n`);

      for (let i = 0; i < 3; i++) {
        appendLog(`[Auto-Fix] Iteration ${i + 1}/3...\n`);
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [{
              role: 'user',
              content: `Fix this ${error.type} error in the code. Return ONLY the complete fixed file, no markdown fences, no explanation.\n\nERROR: ${error.message}\n\nFILE: ${targetFile.path}\n\nCODE:\n${targetFile.content}`,
            }],
            mode: 'pipeline-stage',
            model: 'qwen2.5-coder:32b',
            max_tokens: 8192,
          }),
        });

        if (!response.ok) {
          appendLog(`[Auto-Fix] API error: ${response.status}\n`);
          break;
        }

        // Parse streamed response with cross-chunk buffer
        const reader = response.body?.getReader();
        if (!reader) break;
        const decoder = new TextDecoder();
        let fixedCode = '';
        let buffer = '';
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6);
              if (data === '[DONE]') continue;
              try {
                const parsed = JSON.parse(data) as { content?: string };
                if (parsed.content) fixedCode += parsed.content;
              } catch { /* skip */ }
            }
          }
        }

        const cleaned = fixedCode.replace(/^```\w*\n?/, '').replace(/\n?```$/, '').trim();
        if (cleaned && cleaned !== targetFile.content) {
          const existingTab = editorStore.tabs.find(t => t.path === targetFile.path);
          editorStore.addDiff({
            fileId: `autofix-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            filename: targetFile.path,
            language: existingTab?.language || 'typescript',
            oldContent: targetFile.content,
            newContent: cleaned,
          });
          targetFile.content = cleaned;
          appendLog(`[Auto-Fix] Created diff for ${targetFile.path} — review in Diff tab\n`);
          toast('Auto-Fix', 'Fix ready for review in Diff tab');
          break;
        } else {
          appendLog('[Auto-Fix] No changes produced, retrying...\n');
        }
      }
    } catch (err) {
      appendLog(`[Auto-Fix] Error: ${err instanceof Error ? err.message : err}\n`);
    } finally {
      setIsAutoFixing(false);
    }
  }, [currentOutput, appendLog]);

  // Verification loop handler (CHANGE 4: wired into LivePreview)
  const handleVerify = useCallback(async () => {
    if (runtime !== 'webcontainer' || runtimeStatus !== 'ready') {
      toast('Verify', 'Run the WebContainer first (click Run)');
      return;
    }

    setIsVerifying(true);
    setVerifyResult(null);
    setShowTerminal(true);
    appendLog('\n--- Verification Loop Started ---\n');

    try {
      const { runVerificationLoop } = await import('@/lib/agents/verificationLoop');
      const wcRuntime = await import('@/lib/preview/webcontainerRuntime');

      const files = previewFiles.map(f => ({ path: f.path, content: f.content, language: f.language }));

      // EnvConfig is not needed client-side — the verification loop calls
      // callModel which uses server env via the API route. Pass empty config
      // since the LLM call goes through /api/chat server-side.
      const env = {};

      const result = await runVerificationLoop(files, env, {
        onStatusChange: (status) => {
          appendLog(`[Verify] ${status}\n`);
        },
        onOutput: (output) => {
          appendLog(output);
        },
        writeFiles: async (filesToWrite) => {
          for (const f of filesToWrite) {
            await wcRuntime.writeFile(f.path, f.content);
          }
        },
        runCommand: async (cmd, args) => {
          let output = '';
          const exitCode = await wcRuntime.runCommand(cmd, args, (data) => {
            output += data;
          });
          return { output, exitCode };
        },
      }, 3);

      setVerifyResult({ passed: result.passed, errors: result.errors, fixAttempts: result.fixAttempts });

      if (result.passed) {
        appendLog('\n--- Verification PASSED ---\n');
        toast('Verify', 'Build and tests passed!');
      } else {
        appendLog(`\n--- Verification FAILED (${result.fixAttempts} fix attempts) ---\n`);
        toast('Verify', `Failed after ${result.fixAttempts} fix attempts`);
      }

      // Apply any fixed files back to editor as diffs
      if (result.fixAttempts > 0) {
        const editorStore = useEditorStore.getState();
        for (const fixed of result.files) {
          const original = previewFiles.find(f => f.path === fixed.path);
          if (original && original.content !== fixed.content) {
            editorStore.addDiff({
              fileId: `verify-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              filename: fixed.path,
              language: fixed.language,
              oldContent: original.content,
              newContent: fixed.content,
            });
          }
        }
        if (result.fixAttempts > 0) {
          toast('Verify', 'Fixed files ready for review in Diff tab');
        }
      }
    } catch (err) {
      appendLog(`[Verify] Error: ${err instanceof Error ? err.message : err}\n`);
      setVerifyResult({ passed: false, errors: [String(err)], fixAttempts: 0 });
    } finally {
      setIsVerifying(false);
    }
  }, [runtime, runtimeStatus, previewFiles, appendLog]);

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
  const parsedError = showAutoFix ? parseError(currentOutput) : null;

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

        {/* Auto-Fix button (Feature 3) */}
        {showAutoFix && !isAutoFixing && (
          <button
            onClick={handleAutoFix}
            className="flex items-center gap-1 rounded bg-pablo-red/10 px-2 py-0.5 font-ui text-[10px] text-pablo-red transition-colors hover:bg-pablo-red/20"
          >
            <Wrench size={10} />
            Auto-Fix
          </button>
        )}
        {isAutoFixing && (
          <div className="flex items-center gap-1 rounded bg-pablo-gold/10 px-2 py-0.5">
            <Loader2 size={10} className="animate-spin text-pablo-gold" />
            <span className="font-ui text-[10px] text-pablo-gold">Fixing...</span>
          </div>
        )}

        {/* Verify button — runs build-test-fix loop in WebContainer */}
        {runtime === 'webcontainer' && runtimeStatus === 'ready' && !isVerifying && (
          <button
            onClick={handleVerify}
            className="flex items-center gap-1 rounded bg-pablo-green/10 px-2 py-0.5 font-ui text-[10px] text-pablo-green transition-colors hover:bg-pablo-green/20"
          >
            <CheckCircle2 size={10} />
            Verify
          </button>
        )}
        {isVerifying && (
          <div className="flex items-center gap-1 rounded bg-pablo-gold/10 px-2 py-0.5">
            <Loader2 size={10} className="animate-spin text-pablo-gold" />
            <span className="font-ui text-[10px] text-pablo-gold">Verifying...</span>
          </div>
        )}
        {verifyResult && !isVerifying && (
          <span className={`rounded px-1.5 py-0.5 font-code text-[9px] ${
            verifyResult.passed ? 'bg-pablo-green/10 text-pablo-green' : 'bg-pablo-red/10 text-pablo-red'
          }`}>
            {verifyResult.passed ? 'PASS' : `FAIL (${verifyResult.fixAttempts} fixes)`}
          </span>
        )}

        {/* Inspect mode toggle (Preview Bridge) */}
        <button
          onClick={toggleInspect}
          className={`flex h-6 w-6 items-center justify-center rounded transition-colors ${
            inspectMode ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'
          }`}
          title="Inspect element"
        >
          <Crosshair size={12} />
        </button>

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

        {/* Selected element info (Preview Bridge) */}
        {selectedElement && (
          <div className="shrink-0 border-t border-pablo-border bg-pablo-panel px-3 py-1.5">
            <div className="flex items-center gap-2">
              <Crosshair size={10} className="text-pablo-gold" />
              <span className="font-code text-[10px] text-pablo-text-dim">
                &lt;{selectedElement.tagName.toLowerCase()}{selectedElement.className ? ` class="${selectedElement.className.slice(0, 40)}"` : ''}&gt;
              </span>
              {selectedElement.componentName && (
                <span className="rounded bg-pablo-gold/10 px-1.5 py-0.5 font-code text-[9px] text-pablo-gold">
                  {selectedElement.componentName}
                </span>
              )}
              <button
                onClick={() => setSelectedElement(null)}
                className="ml-auto text-pablo-text-muted hover:text-pablo-text-dim"
              >
                <span className="font-code text-[9px]">dismiss</span>
              </button>
            </div>
          </div>
        )}

        {/* Terminal output panel */}
        {showTerminal && (
          <div className="h-48 border-t border-pablo-border bg-[#0d1117] overflow-auto" ref={terminalRef}>
            <div className="flex items-center gap-1.5 border-b border-[#30363d] px-3 py-1">
              <TerminalIcon size={10} className="text-pablo-gold" />
              <span className="font-code text-[10px] text-pablo-text-muted">Output</span>
              {parsedError && (
                <span className="ml-auto rounded bg-pablo-red/20 px-1.5 py-0.5 font-code text-[9px] text-pablo-red">
                  {parsedError.type}: {parsedError.message.slice(0, 60)}
                </span>
              )}
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
