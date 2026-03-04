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

    // Built-in commands for local terminal
    const COMMANDS: Record<string, () => string> = {
      help: () => [
        '\x1b[1;38;2;212;168;67mAvailable Commands:\x1b[0m',
        '  \x1b[38;2;96;165;250mhelp\x1b[0m       Show this help message',
        '  \x1b[38;2;96;165;250mclear\x1b[0m      Clear the terminal',
        '  \x1b[38;2;96;165;250mversion\x1b[0m    Show Pablo version info',
        '  \x1b[38;2;96;165;250mmodels\x1b[0m     List available AI models',
        '  \x1b[38;2;96;165;250mstatus\x1b[0m     Show session status',
        '  \x1b[38;2;96;165;250mecho\x1b[0m       Echo text back',
        '',
        '\x1b[38;2;100;116;139m  Tip: Full shell access requires a Docker sandbox connection.\x1b[0m',
      ].join('\r\n'),
      version: () => '\x1b[38;2;212;168;67mPablo IDE\x1b[0m v5.0 — AI-Powered Development Environment',
      models: () => [
        '\x1b[1;38;2;212;168;67mConfigured Models:\x1b[0m',
        '  \x1b[38;2;167;139;250m●\x1b[0m deepseek-v3.2    \x1b[38;2;100;116;139m(reasoning & planning)\x1b[0m',
        '  \x1b[38;2;59;130;246m●\x1b[0m qwen3-coder:480b \x1b[38;2;100;116;139m(code generation)\x1b[0m',
        '  \x1b[38;2;34;197;94m●\x1b[0m gpt-oss:120b     \x1b[38;2;100;116;139m(chat & docs)\x1b[0m',
      ].join('\r\n'),
      status: () => [
        '\x1b[1;38;2;212;168;67mSession Status:\x1b[0m',
        `  Runtime:  \x1b[38;2;212;168;67m${Math.floor((Date.now() - performance.timeOrigin) / 60000)}m\x1b[0m`,
        '  Backend:  \x1b[38;2;34;197;94mOllama Cloud\x1b[0m',
        '  Terminal: \x1b[38;2;100;116;139mLocal (no sandbox)\x1b[0m',
      ].join('\r\n'),
    };

    let currentLine = '';
    let isExecuting = false;

    const executeCommand = async (command: string) => {
      isExecuting = true;

      // Feature 2: Try WebContainer shell first, then /api/terminal, then local fallback
      let handled = false;

      // Attempt WebContainer shell
      try {
        const { runCommand } = await import('@/lib/preview/webcontainerRuntime');
        const parts = command.split(/\s+/);
        const cmd = parts[0];
        const args = parts.slice(1);

        await runCommand(cmd, args, (data: string) => {
          const formatted = data.replace(/\n/g, '\r\n');
          term.write(formatted);
        });
        handled = true;
      } catch {
        // WebContainer not booted or command failed — fall through
      }

      if (!handled) {
        try {
          const response = await fetch('/api/terminal', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ command }),
          });
          if (response.ok) {
            const result = (await response.json()) as { output: string; exitCode: number };
            if (result.output) {
              const formatted = result.output.replace(/\n/g, '\r\n');
              term.writeln(formatted);
            }
            handled = true;
          }
        } catch {
          // API unavailable — fall through to local
        }
      }

      if (!handled) {
        // Fallback to local commands
        if (command === 'clear') {
          term.clear();
        } else if (command.startsWith('echo ')) {
          term.writeln(command.slice(5));
        } else if (command in COMMANDS) {
          term.writeln(COMMANDS[command]());
        } else {
          term.writeln(`\x1b[38;2;239;68;68mpablo:\x1b[0m command not found: ${command}`);
          term.writeln('\x1b[38;2;100;116;139m  Type "help" for available commands\x1b[0m');
        }
      }

      isExecuting = false;
      term.write('\x1b[38;2;148;163;184m$ \x1b[0m');
    };

    term.onData((data) => {
      if (isExecuting) return;
      const code = data.charCodeAt(0);

      if (code === 13) {
        // Enter
        term.writeln('');
        const trimmed = currentLine.trim();
        if (trimmed === 'clear') {
          term.clear();
          term.write('\x1b[38;2;148;163;184m$ \x1b[0m');
        } else if (trimmed) {
          executeCommand(trimmed);
        } else {
          term.write('\x1b[38;2;148;163;184m$ \x1b[0m');
        }
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
    <div className="flex h-full flex-col bg-pablo-bg" style={{ minHeight: 0 }}>
      <div
        ref={termRef}
        className="flex-1 overflow-hidden px-1"
        style={{ display: isReady ? 'block' : 'none', minHeight: 0 }}
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
