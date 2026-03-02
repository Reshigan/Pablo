'use client';

import { useCallback, useRef, useEffect } from 'react';
import Editor, { type OnMount, type Monaco } from '@monaco-editor/react';

type IStandaloneThemeData = Parameters<Monaco['editor']['defineTheme']>[1];
type IStandaloneCodeEditor = Parameters<OnMount>[0];
import { useEditorStore } from '@/stores/editor';

// Pablo dark theme for Monaco
const PABLO_THEME: IStandaloneThemeData = {
  base: 'vs-dark',
  inherit: true,
  rules: [
    { token: '', foreground: 'E2E8F0', background: '0B0F19' },
    { token: 'comment', foreground: '64748B', fontStyle: 'italic' },
    { token: 'keyword', foreground: 'A78BFA' },
    { token: 'string', foreground: '22C55E' },
    { token: 'number', foreground: 'F59E0B' },
    { token: 'type', foreground: '3B82F6' },
    { token: 'function', foreground: 'D4A843' },
    { token: 'variable', foreground: 'E2E8F0' },
    { token: 'constant', foreground: 'EF4444' },
    { token: 'operator', foreground: '94A3B8' },
    { token: 'delimiter', foreground: '94A3B8' },
    { token: 'tag', foreground: 'EF4444' },
    { token: 'attribute.name', foreground: 'D4A843' },
    { token: 'attribute.value', foreground: '22C55E' },
    { token: 'regexp', foreground: 'F59E0B' },
    { token: 'meta', foreground: '94A3B8' },
  ],
  colors: {
    'editor.background': '#0B0F19',
    'editor.foreground': '#E2E8F0',
    'editor.lineHighlightBackground': '#1F293730',
    'editor.selectionBackground': '#D4A84330',
    'editor.inactiveSelectionBackground': '#D4A84315',
    'editorCursor.foreground': '#D4A843',
    'editorLineNumber.foreground': '#64748B',
    'editorLineNumber.activeForeground': '#94A3B8',
    'editorIndentGuide.background': '#1E293B',
    'editorIndentGuide.activeBackground': '#334155',
    'editor.selectionHighlightBackground': '#D4A84320',
    'editorBracketMatch.background': '#D4A84320',
    'editorBracketMatch.border': '#D4A84380',
    'editorWidget.background': '#111827',
    'editorWidget.border': '#1E293B',
    'editorSuggestWidget.background': '#111827',
    'editorSuggestWidget.border': '#1E293B',
    'editorSuggestWidget.selectedBackground': '#1F2937',
    'editorHoverWidget.background': '#111827',
    'editorHoverWidget.border': '#1E293B',
    'scrollbar.shadow': '#00000000',
    'scrollbarSlider.background': '#33415540',
    'scrollbarSlider.hoverBackground': '#33415580',
    'scrollbarSlider.activeBackground': '#334155A0',
    'minimap.background': '#0B0F19',
  },
};

export function CodeEditor() {
  const editorRef = useRef<IStandaloneCodeEditor | null>(null);
  const { tabs, activeTabId, updateContent } = useEditorStore();
  const activeTab = tabs.find((t) => t.id === activeTabId);

  const handleEditorMount: OnMount = useCallback(
    (editorInstance: IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editorInstance;

      // Register Pablo theme
      monaco.editor.defineTheme('pablo-dark', PABLO_THEME);
      monaco.editor.setTheme('pablo-dark');

      // Cmd+S / Ctrl+S: save file via store (persists to DB + marks clean)
      editorInstance.addCommand(
        monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
        () => {
          const store = useEditorStore.getState();
          const tab = store.tabs.find(t => t.id === store.activeTabId);
          if (tab && tab.isDirty) {
            store.saveFile(tab.id);
          }
        }
      );

      // Editor settings
      editorInstance.updateOptions({
        fontSize: 13,
        fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
        fontLigatures: true,
        lineHeight: 20,
        minimap: { enabled: true, maxColumn: 80 },
        scrollBeyondLastLine: false,
        smoothScrolling: true,
        cursorBlinking: 'smooth',
        cursorSmoothCaretAnimation: 'on',
        renderLineHighlight: 'gutter',
        bracketPairColorization: { enabled: true },
        guides: {
          bracketPairs: true,
          indentation: true,
        },
        padding: { top: 8 },
        wordWrap: 'off',
        tabSize: 2,
        insertSpaces: true,
        formatOnPaste: true,
        formatOnType: true,
        automaticLayout: true,
      });
    },
    []
  );

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (activeTabId && value !== undefined) {
        updateContent(activeTabId, value);
      }
    },
    [activeTabId, updateContent]
  );

  if (!activeTab) {
    return null;
  }

  return (
    <div className="flex-1 overflow-hidden">
      <Editor
        height="100%"
        language={activeTab.language}
        value={activeTab.content}
        onChange={handleEditorChange}
        onMount={handleEditorMount}
        theme="vs-dark"
        loading={
          <div className="flex h-full items-center justify-center bg-pablo-bg">
            <div className="animate-pulse-gold font-ui text-sm text-pablo-text-dim">
              Loading editor...
            </div>
          </div>
        }
        options={{
          readOnly: false,
          automaticLayout: true,
        }}
      />
    </div>
  );
}
