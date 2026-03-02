'use client';

import { X, FileCode2, FileJson, FileText, File } from 'lucide-react';
import { useEditorStore } from '@/stores/editor';

function getFileIcon(name: string) {
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
      return FileCode2;
    case 'json':
      return FileJson;
    case 'md':
    case 'txt':
      return FileText;
    default:
      return File;
  }
}

export function FileTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore();

  if (tabs.length === 0) return null;

  return (
    <div className="flex h-9 shrink-0 items-center overflow-x-auto border-b border-pablo-border bg-pablo-panel">
      {tabs.map((tab) => {
        const isActive = tab.id === activeTabId;
        const FileIcon = getFileIcon(tab.name);

        return (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`group flex h-full shrink-0 cursor-pointer items-center gap-1.5 border-r border-pablo-border px-3 font-ui text-xs transition-colors duration-100 ${
              isActive
                ? 'bg-pablo-bg text-pablo-text border-b-2 border-b-pablo-gold'
                : 'bg-pablo-panel text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
            }`}
            role="tab"
            aria-selected={isActive}
          >
            <FileIcon size={14} className={isActive ? 'text-pablo-gold' : 'text-pablo-text-muted'} />
            <span className="max-w-[120px] truncate">{tab.name}</span>
            {tab.isDirty && (
              <span className="ml-0.5 h-2 w-2 rounded-full bg-pablo-gold" title="Unsaved changes" />
            )}
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              className="ml-1 flex h-4 w-4 items-center justify-center rounded text-pablo-text-muted opacity-0 transition-all duration-100 hover:bg-pablo-hover hover:text-pablo-text group-hover:opacity-100"
              aria-label={`Close ${tab.name}`}
            >
              <X size={12} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
