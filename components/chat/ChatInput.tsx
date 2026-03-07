'use client';

/**
 * ChatInput — Input area with file attachment, voice recording, and mode selector.
 * Extracted from ChatPanel.tsx (Task 29).
 */

import { useRef, useCallback, useState } from 'react';
import {
  Send,
  Paperclip,
  StopCircle,
  X,
  FileText,
  MessageSquare,
  Search,
  Wrench,
  Mic,
  Cpu,
  Play,
} from 'lucide-react';
import { useUIStore } from '@/stores/ui';

export type ChatMode = 'auto' | 'chat' | 'evaluate' | 'fix';

interface ChatInputProps {
  input: string;
  setInput: (value: string) => void;
  manualMode: ChatMode;
  setManualMode: (mode: ChatMode) => void;
  detectedIntent: 'chat' | 'evaluate' | 'fix';
  setDetectedIntent: (intent: 'chat' | 'evaluate' | 'fix') => void;
  attachments: Array<{ name: string; content: string; type: string }>;
  setAttachments: React.Dispatch<React.SetStateAction<Array<{ name: string; content: string; type: string }>>>;
  isStreaming: boolean;
  isRecording: boolean;
  onSubmit: (e: React.FormEvent) => void;
  onStop: () => void;
  onToggleVoice: () => void;
  detectIntentFromInput: (text: string) => 'chat' | 'evaluate' | 'fix';
  inputRef: React.RefObject<HTMLTextAreaElement | null>;
}

export function ChatInput({
  input,
  setInput,
  manualMode,
  setManualMode,
  detectedIntent,
  setDetectedIntent,
  attachments,
  setAttachments,
  isStreaming,
  isRecording,
  onSubmit,
  onStop,
  onToggleVoice,
  detectIntentFromInput,
  inputRef,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit(e);
    }
  };

  // Phase: Document upload — support all file types including binary (PDF, DOCX, images)
  const BINARY_EXTENSIONS = new Set(['pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp', 'rtf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico', 'tiff']);

  const handleFileAttach = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach((file) => {
      const ext = file.name.split('.').pop()?.toLowerCase() || '';
      const isBinary = BINARY_EXTENSIONS.has(ext) || file.type.startsWith('image/') || file.type === 'application/pdf';

      if (isBinary) {
        // Read binary files as base64 — include actual data for LLM processing
        const reader = new FileReader();
        reader.onload = () => {
          const base64 = reader.result as string;
          setAttachments((prev) => [...prev, {
            name: file.name,
            content: `[Binary file: ${file.name} (${(file.size / 1024).toFixed(1)}KB, type: ${file.type})]\n\n${base64}`,
            type: file.type || `application/${ext}`,
          }]);
        };
        reader.readAsDataURL(file);
      } else {
        // Read text files directly
        const reader = new FileReader();
        reader.onload = () => {
          const text = reader.result as string;
          setAttachments((prev) => [...prev, { name: file.name, content: text, type: file.type || `text/${ext}` }]);
        };
        reader.readAsText(file);
      }
    });
    // Reset input so same file can be re-selected
    e.target.value = '';
  }, [setAttachments]);

  const removeAttachment = useCallback((index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  }, [setAttachments]);

  return (
    <div className="shrink-0 border-t border-pablo-border p-3">
      {/* Mode selector — scrollable on mobile */}
      <div className="flex items-center gap-1.5 sm:gap-2 mb-2 overflow-x-auto scrollbar-none">
          {(['auto', 'chat', 'evaluate', 'fix'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setManualMode(mode)}
              className={`flex items-center gap-1 rounded-full px-2 py-0.5 font-ui text-[10px] font-medium transition-colors ${
                manualMode === mode
                  ? mode === 'evaluate' ? 'bg-blue-500/20 text-blue-400'
                    : mode === 'fix' ? 'bg-orange-500/20 text-orange-400'
                    : 'bg-pablo-hover text-pablo-text'
                  : 'text-pablo-text-muted hover:text-pablo-text-dim hover:bg-pablo-hover/50'
              }`}
            >
              {mode === 'evaluate' && <Search size={10} />}
              {mode === 'fix' && <Wrench size={10} />}
              {mode === 'auto' && <Cpu size={10} />}
              {mode === 'chat' && <MessageSquare size={10} />}
              {mode.charAt(0).toUpperCase() + mode.slice(1)}
            </button>
          ))}
          {/* CHANGE 5: Pipeline nudge when build-like intent detected */}
          {manualMode === 'auto' && detectedIntent !== 'chat' && (
            <button
              type="button"
              onClick={() => useUIStore.getState().setActiveWorkspaceTab('pipeline')}
              className="ml-1 flex items-center gap-1 rounded-full bg-pablo-gold/10 px-2 py-0.5 font-ui text-[10px] font-medium text-pablo-gold hover:bg-pablo-gold/20 transition-colors"
            >
              <Play size={10} />
              Use Build tab
            </button>
          )}
      </div>

      <form onSubmit={onSubmit} className="flex flex-col gap-2">
        <div className="flex items-end gap-2 rounded-lg border border-pablo-border bg-pablo-input px-3 py-2 focus-within:border-pablo-gold/50">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              if (e.target.value.trim().length > 3) {
                setDetectedIntent(detectIntentFromInput(e.target.value));
              } else {
                setDetectedIntent('chat');
              }
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              manualMode === 'evaluate' ? 'Which repo or code should I evaluate?' :
              manualMode === 'fix' ? 'Describe the bug or paste the error...' :
              'Ask anything, describe a feature, or paste an error...'
            }
            className="max-h-32 min-h-[36px] flex-1 resize-none bg-transparent font-ui text-sm text-pablo-text outline-none placeholder:text-pablo-text-muted"
            rows={1}
          />
          <div className="flex items-center gap-1">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".txt,.md,.json,.csv,.xml,.yaml,.yml,.toml,.ts,.tsx,.js,.jsx,.py,.html,.css,.sql,.env,.sh,.rs,.go,.java,.rb,.php,.swift,.kt,.c,.cpp,.h,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.rtf,.odt,.ods,.odp,.log,.ini,.cfg,.conf,.dockerfile,.makefile,.gitignore,.editorconfig,.prettierrc,.eslintrc,.babelrc,.svg,.graphql,.proto,.tf,.hcl,.lua,.r,.m,.scala,.groovy,.dart,.zig,.nim,.ex,.exs,.erl,.clj,.hs,.ml,.v,.vhd,.asm,.bat,.ps1,.zsh,.fish,.diff,.patch,image/*"
              onChange={handleFileAttach}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
                attachments.length > 0
                  ? 'text-pablo-gold hover:bg-pablo-gold/10'
                  : 'text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
              }`}
              aria-label="Attach file"
              title="Attach document"
            >
              <Paperclip size={14} />
            </button>
            <button
              type="button"
              onClick={onToggleVoice}
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors duration-150 ${
                isRecording
                  ? 'text-pablo-red animate-pulse hover:bg-pablo-red/10'
                  : 'text-pablo-text-muted hover:bg-pablo-hover hover:text-pablo-text-dim'
              }`}
              aria-label={isRecording ? 'Stop recording' : 'Voice input'}
              title={isRecording ? 'Stop recording' : 'Voice-to-text'}
            >
              <Mic size={14} />
            </button>
            {isStreaming ? (
              <button
                type="button"
                onClick={onStop}
                className="flex h-7 w-7 items-center justify-center rounded-md text-pablo-red transition-colors duration-150 hover:bg-pablo-red/10"
                aria-label="Stop generation"
              >
                <StopCircle size={16} />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                className="flex h-7 w-7 items-center justify-center rounded-md bg-pablo-gold text-pablo-bg transition-colors duration-150 hover:bg-pablo-gold-dim disabled:opacity-30 disabled:cursor-not-allowed"
                aria-label="Send message"
              >
                <Send size={14} />
              </button>
            )}
          </div>
        </div>
        {/* Attachment chips */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {attachments.map((att, i) => (
              <span
                key={`${att.name}-${i}`}
                className="flex items-center gap-1 rounded-md bg-pablo-gold/10 px-2 py-0.5 font-ui text-[10px] text-pablo-gold"
              >
                <FileText size={10} />
                {att.name}
                <button
                  type="button"
                  onClick={() => removeAttachment(i)}
                  className="ml-0.5 rounded-full hover:bg-pablo-gold/20"
                  aria-label={`Remove ${att.name}`}
                >
                  <X size={10} />
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between">
          <span className="font-ui text-[10px] text-pablo-text-muted">
            Enter to send, Shift+Enter for new line
          </span>
          <span className="font-ui text-[10px] text-pablo-text-muted">
            Mode: {manualMode === 'auto' ? 'Auto' : manualMode.charAt(0).toUpperCase() + manualMode.slice(1)}
          </span>
        </div>
      </form>
    </div>
  );
}
