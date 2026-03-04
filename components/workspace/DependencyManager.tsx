'use client';

/**
 * Feature 23: Dependency Manager UI
 * Visual UI to manage npm/pip packages.
 */

import { Package, Trash2, Plus, RefreshCw } from 'lucide-react';
import { useState, useCallback, useMemo } from 'react';
import { useEditorStore } from '@/stores/editor';
import { toast } from '@/stores/toast';

interface DepInfo {
  name: string;
  version: string;
  isDev: boolean;
}

export function DependencyManager() {
  const tabs = useEditorStore((s) => s.tabs);
  const updateContent = useEditorStore((s) => s.updateContent);
  const [newPackage, setNewPackage] = useState('');
  const [isDev, setIsDev] = useState(false);

  const packageJsonTab = useMemo(() => {
    return tabs.find((t) => t.path === 'package.json' || t.path.endsWith('/package.json'));
  }, [tabs]);

  const { deps, devDeps } = useMemo(() => {
    if (!packageJsonTab?.content) return { deps: [] as DepInfo[], devDeps: [] as DepInfo[] };
    try {
      const pkg = JSON.parse(packageJsonTab.content) as {
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      const deps: DepInfo[] = Object.entries(pkg.dependencies || {}).map(([name, version]) => ({
        name,
        version,
        isDev: false,
      }));
      const devDeps: DepInfo[] = Object.entries(pkg.devDependencies || {}).map(([name, version]) => ({
        name,
        version,
        isDev: true,
      }));
      return { deps, devDeps };
    } catch {
      return { deps: [] as DepInfo[], devDeps: [] as DepInfo[] };
    }
  }, [packageJsonTab]);

  const handleRemove = useCallback(
    (name: string, isDevDep: boolean) => {
      if (!packageJsonTab) return;
      try {
        const pkg = JSON.parse(packageJsonTab.content) as Record<string, Record<string, string>>;
        const key = isDevDep ? 'devDependencies' : 'dependencies';
        if (pkg[key]) {
          delete pkg[key][name];
        }
        updateContent(packageJsonTab.id, JSON.stringify(pkg, null, 2));
        toast('Removed', `${name} removed from ${key}`);
      } catch {
        toast('Error', 'Failed to parse package.json');
      }
    },
    [packageJsonTab, updateContent]
  );

  const handleAdd = useCallback(() => {
    if (!packageJsonTab || !newPackage.trim()) return;
    try {
      const pkg = JSON.parse(packageJsonTab.content) as Record<string, Record<string, string>>;
      const key = isDev ? 'devDependencies' : 'dependencies';
      if (!pkg[key]) pkg[key] = {};
      pkg[key][newPackage.trim()] = 'latest';
      updateContent(packageJsonTab.id, JSON.stringify(pkg, null, 2));
      toast('Added', `${newPackage.trim()} added to ${key}`);
      setNewPackage('');
    } catch {
      toast('Error', 'Failed to parse package.json');
    }
  }, [packageJsonTab, newPackage, isDev, updateContent]);

  if (!packageJsonTab) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center p-8">
        <Package size={48} className="text-pablo-text-muted" />
        <p className="font-ui text-sm text-pablo-text-dim">No package.json found</p>
        <p className="font-ui text-xs text-pablo-text-muted">
          Open a project with package.json to manage dependencies
        </p>
      </div>
    );
  }

  const renderDepList = (items: DepInfo[], title: string) => (
    <div className="mb-3">
      <h3 className="mb-1 font-ui text-[11px] font-medium text-pablo-text-dim">{title}</h3>
      {items.length === 0 ? (
        <p className="font-ui text-[10px] text-pablo-text-muted">None</p>
      ) : (
        <div className="space-y-0.5">
          {items.map((dep) => (
            <div
              key={dep.name}
              className="flex items-center gap-2 rounded px-2 py-1 transition-colors hover:bg-pablo-hover"
            >
              <span className="min-w-0 flex-1 truncate font-code text-[11px] text-pablo-text">
                {dep.name}
              </span>
              <span className="shrink-0 font-code text-[10px] text-pablo-text-muted">
                {dep.version}
              </span>
              <button
                onClick={() => handleRemove(dep.name, dep.isDev)}
                className="shrink-0 rounded p-0.5 text-pablo-text-muted transition-colors hover:bg-pablo-red/10 hover:text-pablo-red"
              >
                <Trash2 size={11} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      <div className="flex items-center gap-2 border-b border-pablo-border px-4 py-2 shrink-0">
        <Package size={14} className="text-pablo-gold" />
        <span className="font-ui text-xs font-medium text-pablo-text">Dependencies</span>
        <span className="ml-auto font-code text-[10px] text-pablo-text-muted">
          {deps.length + devDeps.length} packages
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-2">
        {renderDepList(deps, 'Dependencies')}
        {renderDepList(devDeps, 'Dev Dependencies')}
      </div>

      {/* Add package */}
      <div className="border-t border-pablo-border px-3 py-2 shrink-0">
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={newPackage}
            onChange={(e) => setNewPackage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAdd();
            }}
            placeholder="package-name"
            className="flex-1 rounded border border-pablo-border bg-pablo-input px-2 py-1 font-code text-[11px] text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          />
          <label className="flex items-center gap-1 font-ui text-[10px] text-pablo-text-muted">
            <input
              type="checkbox"
              checked={isDev}
              onChange={(e) => setIsDev(e.target.checked)}
              className="rounded"
            />
            dev
          </label>
          <button
            onClick={handleAdd}
            disabled={!newPackage.trim()}
            className="flex h-6 items-center gap-1 rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20 disabled:opacity-30"
          >
            <Plus size={10} />
            Add
          </button>
        </div>
      </div>
    </div>
  );
}
