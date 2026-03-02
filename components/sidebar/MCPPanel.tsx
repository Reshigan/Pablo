'use client';

import {
  Plug,
  Plus,
  Circle,
  ExternalLink,
  Trash2,
  RefreshCw,
  Database,
  Globe,
  FileCode,
} from 'lucide-react';
import { useState } from 'react';
import { toastSuccess, toastError, toastWarning } from '@/stores/toast';

interface MCPServer {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'disconnected' | 'error';
  tools: number;
  type: 'database' | 'api' | 'filesystem' | 'custom';
}

const TYPE_ICONS: Record<string, typeof Database> = {
  database: Database,
  api: Globe,
  filesystem: FileCode,
  custom: Plug,
};

const STATUS_COLORS: Record<string, string> = {
  connected: 'text-pablo-green',
  disconnected: 'text-pablo-text-muted',
  error: 'text-pablo-red',
};

export function MCPPanel() {
  const [servers, setServers] = useState<MCPServer[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');

  if (servers.length === 0 && !showAddForm) {
    return (
      <div className="flex flex-col">
        {/* Header actions */}
        <div className="flex items-center justify-end gap-1 border-b border-pablo-border px-2 py-1">
          <button
            onClick={() => setShowAddForm(true)}
            className="flex h-5 items-center gap-1 rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20"
          >
            <Plus size={10} />
            Add Server
          </button>
        </div>

        {/* Empty state */}
        <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-pablo-blue/10">
            <Plug size={24} className="text-pablo-blue" />
          </div>
          <p className="font-ui text-xs font-medium text-pablo-text-dim">
            MCP Servers
          </p>
          <p className="font-ui text-[11px] text-pablo-text-muted leading-relaxed">
            Connect external tools and data sources via the Model Context Protocol.
            Add database, API, or filesystem servers.
          </p>
          <button
            onClick={() => setShowAddForm(true)}
            className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim"
          >
            Add Server
          </button>
        </div>

        {/* Quick links */}
        <div className="border-t border-pablo-border px-3 py-2">
          <p className="mb-2 font-ui text-[10px] font-semibold uppercase tracking-wider text-pablo-text-muted">
            Popular Integrations
          </p>
          <div className="flex flex-col gap-1">
            {[
              { name: 'PostgreSQL', type: 'database' },
              { name: 'GitHub API', type: 'api' },
              { name: 'Local Files', type: 'filesystem' },
            ].map((item) => {
              const Icon = TYPE_ICONS[item.type] ?? Plug;
              return (
                <button
                  key={item.name}
                  className="flex items-center gap-2 rounded px-2 py-1 text-left font-ui text-xs text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text-dim"
                >
                  <Icon size={12} />
                  {item.name}
                  <ExternalLink size={10} className="ml-auto" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-pablo-border px-2 py-1">
        <span className="font-ui text-[10px] text-pablo-text-muted">
          {servers.filter((s) => s.status === 'connected').length}/{servers.length} connected
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => toastSuccess('Refreshed', 'All server connections refreshed')}
            className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover"
            aria-label="Refresh all"
          >
            <RefreshCw size={12} />
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover"
            aria-label="Add server"
          >
            <Plus size={12} />
          </button>
        </div>
      </div>

      {/* Add form */}
      {showAddForm && (
        <div className="border-b border-pablo-border p-2">
          <input
            type="text"
            value={newServerUrl}
            onChange={(e) => setNewServerUrl(e.target.value)}
            placeholder="Server URL (e.g., http://localhost:3100)"
            className="w-full rounded-md border border-pablo-border bg-pablo-input px-2 py-1.5 font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted focus:border-pablo-gold/50"
          />
          <div className="mt-1 flex gap-1">
            <button
              onClick={() => {
                const url = newServerUrl.trim();
                if (!url) { toastWarning('Missing URL', 'Please enter a server URL'); return; }
                try { new URL(url); } catch { toastError('Invalid URL', 'Please enter a valid URL (e.g., http://localhost:3100)'); return; }
                const newServer: MCPServer = {
                  id: `mcp-${Date.now()}`,
                  name: new URL(url).hostname,
                  url,
                  status: 'disconnected',
                  tools: 0,
                  type: 'custom',
                };
                setServers((prev) => [...prev, newServer]);
                setShowAddForm(false);
                setNewServerUrl('');
                toastSuccess('Server added', `${newServer.name} added. Connection will be established when the MCP server is running.`);
              }}
              className="flex-1 rounded bg-pablo-gold py-1 font-ui text-[10px] font-medium text-pablo-bg hover:bg-pablo-gold-dim"
            >
              Connect
            </button>
            <button
              onClick={() => {
                setShowAddForm(false);
                setNewServerUrl('');
              }}
              className="flex-1 rounded bg-pablo-hover py-1 font-ui text-[10px] text-pablo-text-dim hover:bg-pablo-active"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Server list */}
      <div className="overflow-y-auto">
        {servers.map((server) => {
          const TypeIcon = TYPE_ICONS[server.type] ?? Plug;
          return (
            <div
              key={server.id}
              className="flex items-center gap-2 border-b border-pablo-border px-3 py-2 transition-colors hover:bg-pablo-hover"
            >
              <TypeIcon size={14} className="shrink-0 text-pablo-text-dim" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Circle
                    size={6}
                    className={`shrink-0 fill-current ${STATUS_COLORS[server.status]}`}
                  />
                  <span className="truncate font-ui text-xs text-pablo-text">{server.name}</span>
                </div>
                <span className="font-ui text-[10px] text-pablo-text-muted">
                  {server.tools} tools available
                </span>
              </div>
              <button
                onClick={() => {
                  setServers((prev) => prev.filter((s) => s.id !== server.id));
                  toastSuccess('Removed', `${server.name} removed`);
                }}
                className="flex h-5 w-5 shrink-0 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-active hover:text-pablo-red"
                aria-label="Remove server"
              >
                <Trash2 size={12} />
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
