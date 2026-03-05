'use client';

import { useRef, useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, FileCode2, FileJson, FileText, File } from 'lucide-react';
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

/**
 * Task 41: Improved file tabs — horizontal scroll, arrow overflow buttons,
 * gold dirty dot, hover-only close button, gold bottom border on active.
 */
export function FileTabs() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useEditorStore();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setCanScrollLeft(el.scrollLeft > 0);
      setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
    };
    check();
    el.addEventListener('scroll', check);
    const obs = new ResizeObserver(check);
    obs.observe(el);
    return () => { el.removeEventListener('scroll', check); obs.disconnect(); };
  }, [tabs.length]);

  if (tabs.length === 0) return null;

  const scroll = (dir: 'left' | 'right') => {
    scrollRef.current?.scrollBy({ left: dir === 'left' ? -120 : 120, behavior: 'smooth' });
  };

  return (
    <div className="relative flex h-8 shrink-0 items-center border-b border-pablo-border bg-pablo-surface-1 px-1.5">
      {/* Left arrow */}
      {canScrollLeft && (
        <button onClick={() => scroll('left')} className="absolute left-0 z-10 flex h-full w-6 items-center justify-center bg-gradient-to-r from-pablo-surface-1 to-transparent text-pablo-text-muted hover:text-pablo-text">
          <ChevronLeft size={14} />
        </button>
      )}

      {/* Scrollable tabs */}
      <div ref={scrollRef} className="flex items-center gap-0.5 overflow-x-auto scrollbar-none">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const FileIcon = getFileIcon(tab.name);

          return (
            <div
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`group flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-md px-2.5 font-ui text-[11px] transition-colors duration-100 ${
                isActive
                  ? 'bg-pablo-surface-2 text-pablo-text border-b-2 border-pablo-gold'
                  : 'text-pablo-text-dim hover:bg-pablo-hover hover:text-pablo-text-secondary'
              }`}
              role="tab"
              aria-selected={isActive}
            >
              {tab.isDirty && (
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pablo-gold" title="Unsaved changes" />
              )}
              <FileIcon size={13} className={isActive ? 'text-pablo-gold' : 'text-pablo-text-muted'} />
              <span className="max-w-[120px] truncate">{tab.name}</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  closeTab(tab.id);
                }}
                className="ml-0.5 flex h-4 w-4 items-center justify-center rounded text-pablo-text-muted opacity-0 transition-all duration-100 hover:bg-pablo-hover hover:text-pablo-text group-hover:opacity-100"
                aria-label={`Close ${tab.name}`}
              >
                <X size={11} />
              </button>
            </div>
          );
        })}
      </div>

      {/* Right arrow */}
      {canScrollRight && (
        <button onClick={() => scroll('right')} className="absolute right-0 z-10 flex h-full w-6 items-center justify-center bg-gradient-to-l from-pablo-surface-1 to-transparent text-pablo-text-muted hover:text-pablo-text">
          <ChevronRight size={14} />
        </button>
      )}
    </div>
  );
}
