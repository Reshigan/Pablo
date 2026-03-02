'use client';

import {
  File,
  Folder,
  FolderOpen,
  FolderPlus,
  FilePlus,
  ChevronRight,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { useState, useCallback } from 'react';
import { useEditorStore } from '@/stores/editor';

interface FileNode {
  name: string;
  path: string;
  type: 'file' | 'directory';
  language?: string;
  children?: FileNode[];
}

// Demo file tree for development
const DEMO_TREE: FileNode[] = [
  {
    name: 'src',
    path: '/src',
    type: 'directory',
    children: [
      {
        name: 'app',
        path: '/src/app',
        type: 'directory',
        children: [
          { name: 'page.tsx', path: '/src/app/page.tsx', type: 'file', language: 'typescript' },
          { name: 'layout.tsx', path: '/src/app/layout.tsx', type: 'file', language: 'typescript' },
          { name: 'globals.css', path: '/src/app/globals.css', type: 'file', language: 'css' },
        ],
      },
      {
        name: 'components',
        path: '/src/components',
        type: 'directory',
        children: [
          { name: 'Header.tsx', path: '/src/components/Header.tsx', type: 'file', language: 'typescript' },
          { name: 'Footer.tsx', path: '/src/components/Footer.tsx', type: 'file', language: 'typescript' },
        ],
      },
      {
        name: 'lib',
        path: '/src/lib',
        type: 'directory',
        children: [
          { name: 'utils.ts', path: '/src/lib/utils.ts', type: 'file', language: 'typescript' },
          { name: 'db.ts', path: '/src/lib/db.ts', type: 'file', language: 'typescript' },
        ],
      },
    ],
  },
  { name: 'package.json', path: '/package.json', type: 'file', language: 'json' },
  { name: 'tsconfig.json', path: '/tsconfig.json', type: 'file', language: 'json' },
  { name: 'README.md', path: '/README.md', type: 'file', language: 'markdown' },
];

function getFileIcon(name: string): string {
  const ext = name.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-pablo-blue';
    case 'js':
    case 'jsx':
      return 'text-yellow-400';
    case 'css':
    case 'scss':
      return 'text-pablo-purple';
    case 'json':
      return 'text-pablo-green';
    case 'md':
      return 'text-pablo-text-dim';
    default:
      return 'text-pablo-text-muted';
  }
}

function TreeNode({ node, depth }: { node: FileNode; depth: number }) {
  const [expanded, setExpanded] = useState(depth < 1);
  const openFile = useEditorStore((s) => s.openFile);

  const handleClick = useCallback(() => {
    if (node.type === 'directory') {
      setExpanded((prev) => !prev);
    } else {
      openFile({
        id: node.path,
        path: node.path,
        name: node.name,
        language: node.language ?? 'plaintext',
        content: `// ${node.name}\n// Content loaded from ${node.path}\n`,
      });
    }
  }, [node, openFile]);

  return (
    <div>
      <button
        onClick={handleClick}
        className="flex w-full items-center gap-1 px-1 py-[3px] text-left transition-colors duration-100 hover:bg-pablo-hover"
        style={{ paddingLeft: `${depth * 12 + 8}px` }}
      >
        {node.type === 'directory' ? (
          <>
            {expanded ? (
              <ChevronDown size={14} className="shrink-0 text-pablo-text-muted" />
            ) : (
              <ChevronRight size={14} className="shrink-0 text-pablo-text-muted" />
            )}
            {expanded ? (
              <FolderOpen size={14} className="shrink-0 text-pablo-gold" />
            ) : (
              <Folder size={14} className="shrink-0 text-pablo-gold-dim" />
            )}
          </>
        ) : (
          <>
            <span className="w-3.5 shrink-0" />
            <File size={14} className={`shrink-0 ${getFileIcon(node.name)}`} />
          </>
        )}
        <span className="truncate font-ui text-xs text-pablo-text">{node.name}</span>
      </button>
      {node.type === 'directory' && expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <TreeNode key={child.path} node={child} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

export function FileExplorer() {
  const [hasRepo, setHasRepo] = useState(false);

  if (!hasRepo) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 px-4 py-8 text-center">
        <FolderPlus size={32} className="text-pablo-text-muted" />
        <p className="font-ui text-xs text-pablo-text-muted">
          Clone a repository to get started
        </p>
        <button
          onClick={() => setHasRepo(true)}
          className="rounded-md bg-pablo-gold px-3 py-1.5 font-ui text-xs font-medium text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim"
        >
          Load Demo Project
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      {/* Toolbar */}
      <div className="flex items-center justify-end gap-1 px-2 py-1 border-b border-pablo-border">
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim"
          aria-label="New file"
        >
          <FilePlus size={14} />
        </button>
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim"
          aria-label="New folder"
        >
          <FolderPlus size={14} />
        </button>
        <button
          className="flex h-5 w-5 items-center justify-center rounded text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim"
          aria-label="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* File tree */}
      <div className="py-1">
        {DEMO_TREE.map((node) => (
          <TreeNode key={node.path} node={node} depth={0} />
        ))}
      </div>
    </div>
  );
}
