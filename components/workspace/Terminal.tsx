'use client';

import { useEffect, useRef, useState } from 'react';
import { Terminal as XTerminal } from 'xterm';
import { FitAddon } from '@xterm/addon-fit';
import { SearchAddon } from '@xterm/addon-search';
import 'xterm/css/xterm.css';

export function TerminalPanel() {
  const termRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    if (!termRef.current || xtermRef.current) return;

    const term = new XTerminal({
      theme: {
        background: '#0B0F19',
        foreground: '#E2E8F0',
        cursor: '#D4A843',
        cursorAccent: '#0B0F19',
        selectionBackground: '#D4A84340',
        selectionForeground: '#E2E8F0',
        black: '#0B0F19',
        red: '#EF4444',
        green: '#22C55E',
        yellow: '#D4A843',
        blue: '#3B82F6',
        magenta: '#A78BFA',
        cyan: '#22D3EE',
        white: '#E2E8F0',
        brightBlack: '#64748B',
        brightRed: '#F87171',
        brightGreen: '#4ADE80',
        brightYellow: '#FCD34D',
        brightBlue: '#60A5FA',
        brightMagenta: '#C4B5FD',
        brightCyan: '#67E8F9',
        brightWhite: '#F8FAFC',
      },
      fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 13,
      lineHeight: 1.4,
      cursorBlink: true,
      cursorStyle: 'bar',
      scrollback: 5000,
      allowProposedApi: true,
    });

    const fitAddon = new FitAddon();
    const searchAddon = new SearchAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(searchAddon);

    term.open(termRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Welcome message
    term.writeln('\x1b[38;2;212;168;67m╔══════════════════════════════════════════╗\x1b[0m');
    term.writeln('\x1b[38;2;212;168;67m║\x1b[0m  \x1b[1;38;2;212;168;67mPablo Terminal\x1b[0m                           \x1b[38;2;212;168;67m║\x1b[0m');
    term.writeln('\x1b[38;2;212;168;67m╚══════════════════════════════════════════╝\x1b[0m');
    term.writeln('');
    term.write('\x1b[38;2;148;163;184m$ \x1b[0m');

    // Handle input (echo for now - will connect to Docker sandbox in Phase 6)
    let currentLine = '';
    term.onData((data) => {
      const code = data.charCodeAt(0);

      if (code === 13) {
        // Enter
        term.writeln('');
        if (currentLine.trim()) {
          term.writeln(`\x1b[38;2;100;116;139m  Command will execute in Docker sandbox (Phase 6)\x1b[0m`);
        }
        term.write('\x1b[38;2;148;163;184m$ \x1b[0m');
        currentLine = '';
      } else if (code === 127) {
        // Backspace
        if (currentLine.length > 0) {
          currentLine = currentLine.slice(0, -1);
          term.write('\b \b');
        }
      } else if (code >= 32) {
        // Printable
        currentLine += data;
        term.write(data);
      }
    });

    setIsReady(true);

    // Resize observer
    const resizeObserver = new ResizeObserver(() => {
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
        } catch {
          // Ignore fit errors during resize
        }
      }
    });

    if (termRef.current) {
      resizeObserver.observe(termRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      term.dispose();
      xtermRef.current = null;
    };
  }, []);

  return (
    <div className="flex h-full flex-col bg-pablo-bg">
      <div
        ref={termRef}
        className="flex-1 overflow-hidden px-1"
        style={{ display: isReady ? 'block' : 'none' }}
      />
      {!isReady && (
        <div className="flex flex-1 items-center justify-center">
          <span className="animate-pulse-gold font-ui text-xs text-pablo-text-dim">
            Initializing terminal...
          </span>
        </div>
      )}
    </div>
  );
}
