'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { X, Settings, Cpu, Palette, Keyboard, Database, Globe } from 'lucide-react';
import { useUIStore } from '@/stores/ui';
import { toastSuccess } from '@/stores/toast';

function usePersistedSetting<T>(key: string, defaultValue: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return defaultValue;
    try {
      const stored = localStorage.getItem(`pablo-settings-${key}`);
      return stored ? (JSON.parse(stored) as T) : defaultValue;
    } catch {
      return defaultValue;
    }
  });

  const setPersisted = useCallback((newValue: T) => {
    setValue(newValue);
    try {
      localStorage.setItem(`pablo-settings-${key}`, JSON.stringify(newValue));
    } catch {
      // Ignore localStorage errors
    }
  }, [key]);

  return [value, setPersisted];
}

type SettingsTab = 'general' | 'models' | 'appearance' | 'shortcuts' | 'database' | 'integrations';

const SETTINGS_TABS: Array<{ id: SettingsTab; label: string; icon: typeof Settings }> = [
  { id: 'general', label: 'General', icon: Settings },
  { id: 'models', label: 'AI Models', icon: Cpu },
  { id: 'appearance', label: 'Appearance', icon: Palette },
  { id: 'shortcuts', label: 'Shortcuts', icon: Keyboard },
  { id: 'database', label: 'Database', icon: Database },
  { id: 'integrations', label: 'Integrations', icon: Globe },
];

function GeneralSettings() {
  const [autoSave, setAutoSave] = usePersistedSetting('autoSave', 'After 1 second delay');
  const [shell, setShell] = usePersistedSetting('shell', '/bin/bash');
  const [telemetry, setTelemetry] = usePersistedSetting('telemetry', false);

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-ui text-sm font-semibold text-pablo-text">General Settings</h3>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">Auto-Save</label>
        <select
          value={autoSave}
          onChange={(e) => { setAutoSave(e.target.value); toastSuccess('Setting saved', 'Auto-save preference updated'); }}
          className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-ui text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
        >
          <option>After 1 second delay</option>
          <option>After 3 second delay</option>
          <option>On focus change</option>
          <option>Disabled</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">Terminal Shell</label>
        <select
          value={shell}
          onChange={(e) => { setShell(e.target.value); toastSuccess('Setting saved', 'Shell preference updated'); }}
          className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-ui text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
        >
          <option>/bin/bash</option>
          <option>/bin/zsh</option>
          <option>/bin/sh</option>
        </select>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="font-ui text-xs text-pablo-text-dim">Telemetry</p>
          <p className="font-ui text-[10px] text-pablo-text-muted">Share anonymous usage data</p>
        </div>
        <button
          onClick={() => { setTelemetry(!telemetry); toastSuccess('Setting saved', `Telemetry ${!telemetry ? 'enabled' : 'disabled'}`); }}
          className={`relative h-5 w-9 rounded-full transition-colors ${telemetry ? 'bg-pablo-gold' : 'bg-pablo-border'}`}
        >
          <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-transform ${telemetry ? 'left-[18px]' : 'left-0.5'}`} />
        </button>
      </div>
    </div>
  );
}

function ModelSettings() {
  const [reasoningTemp, setReasoningTemp] = usePersistedSetting('reasoningTemp', 70);
  const [codeTemp, setCodeTemp] = usePersistedSetting('codeTemp', 30);
  const [ollamaEndpoint, setOllamaEndpoint] = usePersistedSetting('ollamaEndpoint', 'http://localhost:11434');

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-ui text-sm font-semibold text-pablo-text">AI Model Configuration</h3>

      <div className="rounded-lg border border-pablo-border bg-pablo-active p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-medium text-pablo-text">DeepSeek-V3.2</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">Reasoning &amp; Planning</p>
          </div>
          <span className="rounded-full bg-pablo-green/20 px-2 py-0.5 font-code text-[10px] text-pablo-green">Active</span>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <label className="font-ui text-[10px] text-pablo-text-muted">Temperature</label>
          <input
            type="range"
            min="0"
            max="100"
            value={reasoningTemp}
            onChange={(e) => setReasoningTemp(Number(e.target.value))}
            className="h-1 w-full accent-pablo-gold"
          />
          <div className="flex justify-between font-code text-[9px] text-pablo-text-muted">
            <span>0.0</span>
            <span>{(reasoningTemp / 100).toFixed(1)}</span>
            <span>1.0</span>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-pablo-border bg-pablo-active p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-medium text-pablo-text">Qwen3-Coder:480B</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">Code Generation</p>
          </div>
          <span className="rounded-full bg-pablo-green/20 px-2 py-0.5 font-code text-[10px] text-pablo-green">Active</span>
        </div>
        <div className="mt-2 flex flex-col gap-1">
          <label className="font-ui text-[10px] text-pablo-text-muted">Temperature</label>
          <input
            type="range"
            min="0"
            max="100"
            value={codeTemp}
            onChange={(e) => setCodeTemp(Number(e.target.value))}
            className="h-1 w-full accent-pablo-gold"
          />
          <div className="flex justify-between font-code text-[9px] text-pablo-text-muted">
            <span>0.0</span>
            <span>{(codeTemp / 100).toFixed(1)}</span>
            <span>1.0</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">Ollama Endpoint</label>
        <input
          type="text"
          value={ollamaEndpoint}
          onChange={(e) => setOllamaEndpoint(e.target.value)}
          className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-code text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
        />
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const [fontSize, setFontSize] = usePersistedSetting('fontSize', '13px (Default)');

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-ui text-sm font-semibold text-pablo-text">Appearance</h3>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">Theme</label>
        <div className="flex gap-2">
          <div className="flex-1 rounded-lg border-2 border-pablo-gold bg-pablo-bg p-3 text-center">
            <div className="mb-1 text-xs text-pablo-gold">●</div>
            <span className="font-ui text-[10px] text-pablo-text-dim">Dark (Default)</span>
          </div>
          <div className="flex-1 rounded-lg border border-pablo-border bg-pablo-panel p-3 text-center opacity-40">
            <div className="mb-1 text-xs text-pablo-text-muted">●</div>
            <span className="font-ui text-[10px] text-pablo-text-muted">Light (N/A)</span>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">Font Size</label>
        <select
          value={fontSize}
          onChange={(e) => { setFontSize(e.target.value); toastSuccess('Setting saved', 'Font size updated'); }}
          className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-ui text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
        >
          <option>12px</option>
          <option>13px (Default)</option>
          <option>14px</option>
          <option>16px</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">Accent Color</label>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full bg-pablo-gold ring-2 ring-pablo-gold/30" />
          <span className="font-code text-xs text-pablo-text-muted">#D4A843</span>
        </div>
      </div>
    </div>
  );
}

function ShortcutSettings() {
  const shortcuts = [
    { label: 'Command Palette', keys: 'Ctrl+Shift+P' },
    { label: 'Toggle Terminal', keys: 'Ctrl+`' },
    { label: 'Toggle Chat', keys: 'Ctrl+Shift+C' },
    { label: 'Toggle Sidebar', keys: 'Ctrl+B' },
    { label: 'File Explorer', keys: 'Ctrl+Shift+E' },
    { label: 'Search', keys: 'Ctrl+Shift+F' },
    { label: 'Source Control', keys: 'Ctrl+Shift+G' },
    { label: 'Open Settings', keys: 'Ctrl+,' },
    { label: 'Save File', keys: 'Ctrl+S' },
    { label: 'Close Tab', keys: 'Ctrl+W' },
  ];

  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-ui text-sm font-semibold text-pablo-text">Keyboard Shortcuts</h3>
      <div className="flex flex-col gap-0.5">
        {shortcuts.map((s) => (
          <div key={s.label} className="flex items-center justify-between rounded px-2 py-1.5 transition-colors hover:bg-pablo-hover">
            <span className="font-ui text-xs text-pablo-text-dim">{s.label}</span>
            <kbd className="rounded border border-pablo-border bg-pablo-active px-2 py-0.5 font-code text-[10px] text-pablo-text-muted">
              {s.keys}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

function DatabaseSettings() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-ui text-sm font-semibold text-pablo-text">Database</h3>

      <div className="rounded-lg border border-pablo-border bg-pablo-active p-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-ui text-xs font-medium text-pablo-text">Cloudflare D1</p>
            <p className="font-ui text-[10px] text-pablo-text-muted">Primary database</p>
          </div>
          <span className="rounded-full bg-pablo-green/20 px-2 py-0.5 font-code text-[10px] text-pablo-green">Connected</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="font-ui text-xs text-pablo-text-dim">D1 Database ID</label>
        <input
          type="text"
          defaultValue="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
          className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-code text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
        />
      </div>

      <button className="self-start rounded bg-pablo-gold/10 px-3 py-1.5 font-ui text-xs text-pablo-gold transition-colors hover:bg-pablo-gold/20">
        Run Migrations
      </button>
    </div>
  );
}

function IntegrationSettings() {
  return (
    <div className="flex flex-col gap-4">
      <h3 className="font-ui text-sm font-semibold text-pablo-text">Integrations</h3>

      <div className="flex flex-col gap-2">
        {[
          { name: 'GitHub', status: 'Connected', statusColor: 'text-pablo-green bg-pablo-green/20' },
          { name: 'Vercel', status: 'Not connected', statusColor: 'text-pablo-text-muted bg-pablo-active' },
          { name: 'Supabase', status: 'Not connected', statusColor: 'text-pablo-text-muted bg-pablo-active' },
          { name: 'Stripe', status: 'Not connected', statusColor: 'text-pablo-text-muted bg-pablo-active' },
        ].map((integration) => (
          <div key={integration.name} className="flex items-center justify-between rounded-lg border border-pablo-border bg-pablo-active p-3">
            <span className="font-ui text-xs font-medium text-pablo-text">{integration.name}</span>
            <span className={`rounded-full px-2 py-0.5 font-code text-[10px] ${integration.statusColor}`}>
              {integration.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const TAB_CONTENT: Record<SettingsTab, React.FC> = {
  general: GeneralSettings,
  models: ModelSettings,
  appearance: AppearanceSettings,
  shortcuts: ShortcutSettings,
  database: DatabaseSettings,
  integrations: IntegrationSettings,
};

export function SettingsModal() {
  const { settingsOpen, toggleSettings } = useUIStore();
  const [activeTab, setActiveTab] = useState<SettingsTab>('general');
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (settingsOpen) {
      setActiveTab('general');
    }
  }, [settingsOpen]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && settingsOpen) {
        toggleSettings();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [settingsOpen, toggleSettings]);

  if (!settingsOpen) return null;

  const TabContent = TAB_CONTENT[activeTab];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      onClick={toggleSettings}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div
        ref={modalRef}
        className="relative flex h-[70vh] w-full max-w-2xl overflow-hidden rounded-xl border border-pablo-border bg-pablo-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Sidebar */}
        <div className="flex w-48 shrink-0 flex-col border-r border-pablo-border bg-pablo-bg">
          <div className="flex items-center gap-2 border-b border-pablo-border px-3 py-3">
            <Settings size={16} className="text-pablo-gold" />
            <span className="font-ui text-sm font-semibold text-pablo-text">Settings</span>
          </div>
          <div className="flex flex-col gap-0.5 p-1">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors ${
                    activeTab === tab.id
                      ? 'bg-pablo-hover text-pablo-text'
                      : 'text-pablo-text-dim hover:bg-pablo-hover'
                  }`}
                >
                  <Icon size={14} className="shrink-0" />
                  <span className="font-ui text-xs">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-1 flex-col">
          {/* Close button */}
          <div className="flex justify-end p-2">
            <button
              onClick={toggleSettings}
              className="flex h-6 w-6 items-center justify-center rounded transition-colors hover:bg-pablo-hover"
            >
              <X size={14} className="text-pablo-text-muted" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-6">
            <TabContent />
          </div>
        </div>
      </div>
    </div>
  );
}
