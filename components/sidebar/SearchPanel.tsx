'use client';

import { Search, Filter, Replace, ChevronDown, ChevronRight, File } from 'lucide-react';
import { useState, useCallback } from 'react';

interface SearchResult {
  file: string;
  line: number;
  content: string;
  matchStart: number;
  matchEnd: number;
}

export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());

  const handleSearch = useCallback(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    // Demo search results
    const demoResults: SearchResult[] = [
      { file: '/src/app/page.tsx', line: 5, content: `import { ${query} } from './lib'`, matchStart: 10, matchEnd: 10 + query.length },
      { file: '/src/app/page.tsx', line: 12, content: `const result = ${query}()`, matchStart: 16, matchEnd: 16 + query.length },
      { file: '/src/lib/utils.ts', line: 3, content: `export function ${query}() {`, matchStart: 17, matchEnd: 17 + query.length },
    ];
    setResults(demoResults);
    setExpandedFiles(new Set(demoResults.map((r) => r.file)));
  }, [query]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        handleSearch();
      }
    },
    [handleSearch]
  );

  const toggleFile = useCallback((file: string) => {
    setExpandedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(file)) next.delete(file);
      else next.add(file);
      return next;
    });
  }, []);

  // Group results by file
  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    if (!acc[r.file]) acc[r.file] = [];
    acc[r.file].push(r);
    return acc;
  }, {});

  return (
    <div className="flex flex-col">
      {/* Search input */}
      <div className="flex flex-col gap-1 p-2">
        <div className="flex items-center gap-1">
          <div className="flex flex-1 items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-1 focus-within:border-pablo-gold/50">
            <Search size={12} className="mr-1 shrink-0 text-pablo-text-muted" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search..."
              className="w-full bg-transparent font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted"
            />
          </div>
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={`flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover ${showReplace ? 'bg-pablo-active text-pablo-text-dim' : ''}`}
            aria-label="Toggle replace"
          >
            <Replace size={14} />
          </button>
        </div>

        {showReplace && (
          <div className="flex items-center rounded-md border border-pablo-border bg-pablo-input px-2 py-1 focus-within:border-pablo-gold/50">
            <input
              type="text"
              value={replaceText}
              onChange={(e) => setReplaceText(e.target.value)}
              placeholder="Replace..."
              className="w-full bg-transparent font-ui text-xs text-pablo-text outline-none placeholder:text-pablo-text-muted"
            />
          </div>
        )}

        {/* Options */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCaseSensitive(!caseSensitive)}
            className={`flex h-5 items-center rounded px-1 font-code text-[10px] transition-colors ${caseSensitive ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'}`}
            title="Match Case"
          >
            Aa
          </button>
          <button
            onClick={() => setWholeWord(!wholeWord)}
            className={`flex h-5 items-center rounded px-1 font-code text-[10px] transition-colors ${wholeWord ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'}`}
            title="Match Whole Word"
          >
            Ab
          </button>
          <button
            onClick={() => setUseRegex(!useRegex)}
            className={`flex h-5 items-center rounded px-1 font-code text-[10px] transition-colors ${useRegex ? 'bg-pablo-gold/20 text-pablo-gold' : 'text-pablo-text-muted hover:bg-pablo-hover'}`}
            title="Use Regular Expression"
          >
            .*
          </button>
          <button
            onClick={handleSearch}
            className="ml-auto flex h-5 items-center rounded bg-pablo-gold/10 px-2 font-ui text-[10px] text-pablo-gold transition-colors hover:bg-pablo-gold/20"
          >
            <Filter size={10} className="mr-1" />
            Search
          </button>
        </div>
      </div>

      {/* Results count */}
      {results.length > 0 && (
        <div className="border-t border-pablo-border px-3 py-1">
          <span className="font-ui text-[10px] text-pablo-text-muted">
            {results.length} results in {Object.keys(grouped).length} files
          </span>
        </div>
      )}

      {/* Results tree */}
      <div className="overflow-y-auto">
        {Object.entries(grouped).map(([file, fileResults]) => (
          <div key={file}>
            <button
              onClick={() => toggleFile(file)}
              className="flex w-full items-center gap-1 px-2 py-1 text-left transition-colors hover:bg-pablo-hover"
            >
              {expandedFiles.has(file) ? (
                <ChevronDown size={12} className="shrink-0 text-pablo-text-muted" />
              ) : (
                <ChevronRight size={12} className="shrink-0 text-pablo-text-muted" />
              )}
              <File size={12} className="shrink-0 text-pablo-blue" />
              <span className="truncate font-ui text-xs text-pablo-text-dim">{file.split('/').pop()}</span>
              <span className="ml-auto shrink-0 rounded bg-pablo-active px-1 font-ui text-[10px] text-pablo-text-muted">
                {fileResults.length}
              </span>
            </button>
            {expandedFiles.has(file) &&
              fileResults.map((r, i) => (
                <button
                  key={`${file}-${r.line}-${i}`}
                  className="flex w-full items-center gap-2 px-6 py-0.5 text-left transition-colors hover:bg-pablo-hover"
                >
                  <span className="shrink-0 font-code text-[10px] text-pablo-text-muted">{r.line}</span>
                  <span className="truncate font-code text-xs text-pablo-text-dim">{r.content}</span>
                </button>
              ))}
          </div>
        ))}
      </div>

      {/* Empty state */}
      {results.length === 0 && query && (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Search size={24} className="text-pablo-text-muted" />
          <p className="font-ui text-xs text-pablo-text-muted">
            No results found
          </p>
        </div>
      )}

      {results.length === 0 && !query && (
        <div className="flex flex-col items-center gap-2 px-4 py-6 text-center">
          <Search size={24} className="text-pablo-text-muted" />
          <p className="font-ui text-xs text-pablo-text-muted">
            Search across your codebase
          </p>
        </div>
      )}
    </div>
  );
}
