'use client';

import {
  Database,
  Table2,
  Key,
  Link2,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  GitBranch,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { toastSuccess, toastError } from '@/stores/toast';
import { useRepoStore } from '@/stores/repo';

interface Column {
  name: string;
  type: string;
  primaryKey: boolean;
  nullable: boolean;
  defaultValue?: string;
  foreignKey?: { table: string; column: string };
}

interface TableSchema {
  name: string;
  columns: Column[];
}

/**
 * Drizzle schema tables — mirrors lib/db/schema.ts
 * This provides a real view of the Pablo D1 database schema
 */
const DRIZZLE_SCHEMA_TABLES: TableSchema[] = [
  {
    name: 'sessions',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
      { name: 'title', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "'Untitled Session'" },
      { name: 'repo_url', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'repo_branch', type: 'TEXT', primaryKey: false, nullable: true, defaultValue: "'main'" },
      { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
      { name: 'updated_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
      { name: 'status', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "'active'" },
      { name: 'metadata', type: 'TEXT', primaryKey: false, nullable: true },
    ],
  },
  {
    name: 'messages',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
      { name: 'session_id', type: 'TEXT', primaryKey: false, nullable: false, foreignKey: { table: 'sessions', column: 'id' } },
      { name: 'role', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'content', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'model', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'tokens', type: 'INTEGER', primaryKey: false, nullable: true },
      { name: 'duration_ms', type: 'INTEGER', primaryKey: false, nullable: true },
      { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
    ],
  },
  {
    name: 'files',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
      { name: 'session_id', type: 'TEXT', primaryKey: false, nullable: false, foreignKey: { table: 'sessions', column: 'id' } },
      { name: 'path', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'name', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'content', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "''" },
      { name: 'language', type: 'TEXT', primaryKey: false, nullable: true, defaultValue: "'plaintext'" },
      { name: 'is_directory', type: 'INTEGER', primaryKey: false, nullable: false, defaultValue: '0' },
      { name: 'parent_path', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
      { name: 'updated_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
    ],
  },
  {
    name: 'pipeline_runs',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
      { name: 'session_id', type: 'TEXT', primaryKey: false, nullable: false, foreignKey: { table: 'sessions', column: 'id' } },
      { name: 'feature_description', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'status', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "'pending'" },
      { name: 'current_stage', type: 'TEXT', primaryKey: false, nullable: true, defaultValue: "'plan'" },
      { name: 'total_tokens', type: 'INTEGER', primaryKey: false, nullable: true, defaultValue: '0' },
      { name: 'total_duration_ms', type: 'INTEGER', primaryKey: false, nullable: true, defaultValue: '0' },
      { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
      { name: 'completed_at', type: 'TEXT', primaryKey: false, nullable: true },
    ],
  },
  {
    name: 'patterns',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
      { name: 'session_id', type: 'TEXT', primaryKey: false, nullable: true, foreignKey: { table: 'sessions', column: 'id' } },
      { name: 'type', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'trigger', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'action', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'confidence', type: 'REAL', primaryKey: false, nullable: false, defaultValue: '0.5' },
      { name: 'usage_count', type: 'INTEGER', primaryKey: false, nullable: false, defaultValue: '0' },
      { name: 'last_used_at', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'metadata', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
    ],
  },
  {
    name: 'domain_kb',
    columns: [
      { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
      { name: 'category', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'title', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'content', type: 'TEXT', primaryKey: false, nullable: false },
      { name: 'tags', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'source', type: 'TEXT', primaryKey: false, nullable: true },
      { name: 'confidence', type: 'REAL', primaryKey: false, nullable: false, defaultValue: '0.8' },
      { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
      { name: 'updated_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
    ],
  },
];

function TableCard({ table, isSelected, onClick, onDelete }: { table: TableSchema; isSelected: boolean; onClick: () => void; onDelete: () => void }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div
      className={`group rounded-lg border transition-colors ${
        isSelected ? 'border-pablo-gold/50 bg-pablo-gold/5' : 'border-pablo-border bg-pablo-panel'
      }`}
    >
      {/* Table header */}
      <div className="flex w-full items-center gap-2 px-3 py-2">
        <button
          onClick={() => {
            onClick();
            setExpanded(!expanded);
          }}
          className="flex flex-1 items-center gap-2 text-left"
        >
          {expanded ? (
            <ChevronDown size={12} className="shrink-0 text-pablo-text-muted" />
          ) : (
            <ChevronRight size={12} className="shrink-0 text-pablo-text-muted" />
          )}
          <Table2 size={14} className="shrink-0 text-pablo-gold" />
          <span className="font-code text-xs font-medium text-pablo-text">{table.name}</span>
          <span className="ml-auto font-code text-[10px] text-pablo-text-muted">
            {table.columns.length} cols
          </span>
        </button>
        <button
          onClick={onDelete}
          className="ml-1 flex h-4 w-4 shrink-0 items-center justify-center rounded text-pablo-text-muted opacity-0 transition-opacity group-hover:opacity-100 hover:text-pablo-red"
          aria-label={`Delete ${table.name}`}
        >
          <Trash2 size={10} />
        </button>
      </div>

      {/* Columns */}
      {expanded && (
        <div className="border-t border-pablo-border">
          {table.columns.map((col) => (
            <div
              key={col.name}
              className="flex items-center gap-1.5 px-3 py-1 text-left transition-colors hover:bg-pablo-hover"
            >
              {col.primaryKey ? (
                <Key size={10} className="shrink-0 text-pablo-gold" />
              ) : col.foreignKey ? (
                <Link2 size={10} className="shrink-0 text-pablo-blue" />
              ) : (
                <span className="w-2.5 shrink-0" />
              )}
              <span className="font-code text-[11px] text-pablo-text-dim">{col.name}</span>
              <span className="ml-auto font-code text-[10px] text-pablo-text-muted">{col.type}</span>
              {col.nullable && (
                <span className="font-code text-[9px] text-pablo-orange">NULL</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function DBDesigner() {
  const selectedRepo = useRepoStore((s) => s.selectedRepo);
  // When a repo is selected, start with an empty schema so users design for their project.
  // Only show Pablo's internal D1 schema when no repo is selected (introspection mode).
  const [tables, setTables] = useState<TableSchema[]>(selectedRepo ? [] : DRIZZLE_SCHEMA_TABLES);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [showSQL, setShowSQL] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTableName, setNewTableName] = useState('');

  const handleAddTable = useCallback(() => {
    const name = newTableName.trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!name) { toastError('Invalid name', 'Table name cannot be empty'); return; }
    if (tables.some((t) => t.name === name)) { toastError('Duplicate', `Table "${name}" already exists`); return; }
    const newTable: TableSchema = {
      name,
      columns: [
        { name: 'id', type: 'TEXT', primaryKey: true, nullable: false },
        { name: 'created_at', type: 'TEXT', primaryKey: false, nullable: false, defaultValue: "datetime('now')" },
      ],
    };
    setTables((prev) => [...prev, newTable]);
    setNewTableName('');
    setShowAddForm(false);
    toastSuccess('Table added', `"${name}" created with id and created_at columns`);
  }, [newTableName, tables]);

  const handleDeleteTable = useCallback((tableName: string) => {
    setTables((prev) => prev.filter((t) => t.name !== tableName));
    if (selectedTable === tableName) setSelectedTable(null);
    toastSuccess('Table removed', `"${tableName}" deleted`);
  }, [selectedTable]);

  const generateSQL = useCallback(() => {
    return tables
      .map((table) => {
        const cols = table.columns
          .map((col) => {
            let def = `  ${col.name} ${col.type}`;
            if (col.primaryKey) def += ' PRIMARY KEY';
            if (!col.nullable) def += ' NOT NULL';
            if (col.defaultValue) def += ` DEFAULT ${col.defaultValue}`;
            return def;
          })
          .join(',\n');

        const fks = table.columns
          .filter((c) => c.foreignKey)
          .map((c) => `  FOREIGN KEY (${c.name}) REFERENCES ${c.foreignKey?.table}(${c.foreignKey?.column})`)
          .join(',\n');

        const allDefs = fks ? `${cols},\n${fks}` : cols;
        return `CREATE TABLE ${table.name} (\n${allDefs}\n);`;
      })
      .join('\n\n');
  }, [tables]);

  if (tables.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 bg-pablo-bg text-center">
        <Database size={40} className="text-pablo-text-muted" />
        <p className="font-ui text-sm text-pablo-text-dim">Database Designer</p>
        <p className="font-ui text-xs text-pablo-text-muted">
          {selectedRepo
            ? `Design the database schema for ${selectedRepo.name}. Add tables below.`
            : 'Design your schema visually. Tables will appear here.'}
        </p>
        {showAddForm ? (
          <div className="flex flex-col gap-2 w-full max-w-[240px]">
            <input
              type="text"
              value={newTableName}
              onChange={(e) => setNewTableName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddTable(); }}
              placeholder="Table name (e.g., orders)"
              className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-code text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
              autoFocus
            />
            <div className="flex gap-1">
              <button onClick={handleAddTable} className="flex-1 rounded bg-pablo-gold py-1 font-ui text-[10px] font-medium text-pablo-bg hover:bg-pablo-gold-dim">Create</button>
              <button onClick={() => { setShowAddForm(false); setNewTableName(''); }} className="flex-1 rounded bg-pablo-hover py-1 font-ui text-[10px] text-pablo-text-dim hover:bg-pablo-active">Cancel</button>
            </div>
          </div>
        ) : (
          <button onClick={() => setShowAddForm(true)} className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors hover:bg-pablo-gold-dim">
            <Plus size={12} className="mr-1 inline" />
            Add Table
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden bg-pablo-bg">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-pablo-border bg-pablo-panel px-3 py-1.5">
        <Database size={14} className="text-pablo-gold" />
        <span className="font-ui text-xs text-pablo-text-dim">
          {tables.length} table{tables.length !== 1 ? 's' : ''}
        </span>
        {selectedRepo && (
          <span className="flex items-center gap-1 rounded bg-pablo-surface-1 px-1.5 py-0.5 font-code text-[10px] text-pablo-text-muted">
            <GitBranch size={9} className="text-pablo-gold" />
            {selectedRepo.name}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <button
            onClick={() => setShowSQL(!showSQL)}
            className={`rounded px-2 py-0.5 font-ui text-[10px] transition-colors ${
              showSQL ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'
            }`}
          >
            SQL
          </button>
          <button
            onClick={() => setShowAddForm(true)}
            className="flex h-5 items-center gap-1 rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20"
          >
            <Plus size={10} />
            Table
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Table list */}
        <div className="flex w-full flex-col gap-2 overflow-y-auto p-3">
          {showAddForm && (
            <div className="flex flex-col gap-2 rounded-lg border border-pablo-gold/30 bg-pablo-gold/5 p-3">
              <input
                type="text"
                value={newTableName}
                onChange={(e) => setNewTableName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleAddTable(); if (e.key === 'Escape') { setShowAddForm(false); setNewTableName(''); } }}
                placeholder="Table name (e.g., orders)"
                className="rounded border border-pablo-border bg-pablo-input px-2 py-1.5 font-code text-xs text-pablo-text outline-none focus:border-pablo-gold/50"
                autoFocus
              />
              <div className="flex gap-1">
                <button onClick={handleAddTable} className="flex-1 rounded bg-pablo-gold py-1 font-ui text-[10px] font-medium text-pablo-bg hover:bg-pablo-gold-dim">Create</button>
                <button onClick={() => { setShowAddForm(false); setNewTableName(''); }} className="flex-1 rounded bg-pablo-hover py-1 font-ui text-[10px] text-pablo-text-dim hover:bg-pablo-active">Cancel</button>
              </div>
            </div>
          )}
          {showSQL ? (
            <pre className="whitespace-pre-wrap rounded-lg border border-pablo-border bg-pablo-panel p-3 font-code text-[11px] text-pablo-text-dim leading-relaxed">
              {generateSQL()}
            </pre>
          ) : (
            tables.map((table) => (
              <TableCard
                key={table.name}
                table={table}
                isSelected={selectedTable === table.name}
                onClick={() => setSelectedTable(table.name === selectedTable ? null : table.name)}
                onDelete={() => handleDeleteTable(table.name)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
