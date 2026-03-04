'use client';

/**
 * Feature 22: Bug Scanner
 * Scan entire project for issues — "Problems" panel like VS Code.
 */

import { Bug, AlertTriangle, Info, Loader2, Search, RefreshCw } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useEditorStore } from '@/stores/editor';
import { useActivityStore } from '@/stores/activity';
import { scanProject, type BugReport } from '@/lib/agents/bugScanner';

const SEVERITY_ICONS = {
  error: Bug,
  warning: AlertTriangle,
  info: Info,
};

const SEVERITY_COLORS = {
  error: 'text-pablo-red',
  warning: 'text-pablo-gold',
  info: 'text-pablo-blue',
};

export function BugScannerPanel() {
  const [reports, setReports] = useState<BugReport[]>([]);
  const [scanning, setScanning] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);

  const handleScan = useCallback(async () => {
    const tabs = useEditorStore.getState().tabs;
    if (tabs.length === 0) return;

    setScanning(true);
    setHasScanned(true);

    const files = tabs
      .filter((t) => t.content && !t.path.includes('node_modules'))
      .map((t) => ({ path: t.path, content: t.content, language: t.language }));

    try {
      const results = await scanProject(files);
      setReports(results);
      useActivityStore.getState().addEntry(
        'scan_completed',
        `Bug scan: ${results.length} issues found in ${files.length} files`
      );
    } catch {
      setReports([]);
    } finally {
      setScanning(false);
    }
  }, []);

  const errorCount = reports.filter((r) => r.severity === 'error').length;
  const warningCount = reports.filter((r) => r.severity === 'warning').length;
  const infoCount = reports.filter((r) => r.severity === 'info').length;

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-pablo-border px-4 py-2 shrink-0">
        <Bug size={14} className="text-pablo-gold" />
        <span className="font-ui text-xs font-medium text-pablo-text">Problems</span>
        {hasScanned && (
          <div className="ml-auto flex items-center gap-2">
            {errorCount > 0 && (
              <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-red">
                <Bug size={10} /> {errorCount}
              </span>
            )}
            {warningCount > 0 && (
              <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-gold">
                <AlertTriangle size={10} /> {warningCount}
              </span>
            )}
            {infoCount > 0 && (
              <span className="flex items-center gap-0.5 font-code text-[10px] text-pablo-blue">
                <Info size={10} /> {infoCount}
              </span>
            )}
          </div>
        )}
        <button
          onClick={handleScan}
          disabled={scanning}
          className="flex h-6 items-center gap-1 rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20 disabled:opacity-30"
        >
          {scanning ? <Loader2 size={10} className="animate-spin" /> : <RefreshCw size={10} />}
          {scanning ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!hasScanned ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <Search size={36} className="text-pablo-text-muted" />
            <p className="font-ui text-sm text-pablo-text-dim">Scan your project for issues</p>
            <p className="font-ui text-xs text-pablo-text-muted">
              Detects bugs, security issues, missing imports, and code smells
            </p>
            <button
              onClick={handleScan}
              className="flex items-center gap-1.5 rounded-lg bg-pablo-gold/20 px-4 py-2 font-ui text-xs text-pablo-gold transition-colors hover:bg-pablo-gold/30"
            >
              <Bug size={14} />
              Run Bug Scanner
            </button>
          </div>
        ) : scanning ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <Loader2 size={24} className="animate-spin text-pablo-gold" />
            <p className="font-ui text-xs text-pablo-text-muted">Scanning project for issues...</p>
          </div>
        ) : reports.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-4 py-12 text-center">
            <Bug size={24} className="text-pablo-green" />
            <p className="font-ui text-sm text-pablo-green">No issues found</p>
          </div>
        ) : (
          <div className="py-1">
            {reports.map((report, idx) => {
              const Icon = SEVERITY_ICONS[report.severity] || Info;
              const color = SEVERITY_COLORS[report.severity] || 'text-pablo-text-muted';

              return (
                <div
                  key={`${report.file}-${report.line}-${idx}`}
                  className="flex items-start gap-2 border-b border-pablo-border/30 px-4 py-1.5 transition-colors hover:bg-pablo-hover cursor-pointer"
                >
                  <Icon size={12} className={`mt-0.5 shrink-0 ${color}`} />
                  <div className="min-w-0 flex-1">
                    <p className="font-ui text-[11px] text-pablo-text-dim leading-tight">
                      {report.message}
                    </p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="font-code text-[10px] text-pablo-text-muted truncate">
                        {report.file}
                        {report.line ? `:${report.line}` : ''}
                      </span>
                    </div>
                    {report.suggestedFix && (
                      <p className="mt-0.5 font-code text-[10px] text-pablo-blue">
                        Fix: {report.suggestedFix}
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
