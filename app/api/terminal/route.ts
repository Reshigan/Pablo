import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * POST /api/terminal - Execute a command and return output
 *
 * Supports three execution modes (checked in order):
 * 1. SANDBOX_URL env var → proxy to external Docker/Fly.io sandbox
 * 2. Cloudflare Workers env (via getCloudflareContext) → proxy to sandbox binding
 * 3. Fallback → built-in command set (safe, no real execution)
 *
 * GET /api/terminal - Returns terminal capabilities and sandbox status
 */

interface TerminalRequest {
  command: string;
  cwd?: string;
  sessionId?: string;
}

/**
 * Resolve sandbox URL from env (process.env or Cloudflare Workers binding)
 */
async function resolveSandboxUrl(): Promise<string | null> {
  // 1. Check process.env
  if (process.env.SANDBOX_URL) return process.env.SANDBOX_URL;

  // 2. Check Cloudflare Workers env binding
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string | undefined>;
    if (cfEnv.SANDBOX_URL) return cfEnv.SANDBOX_URL;
  } catch {
    // Not running on Cloudflare Workers
  }

  return null;
}

// Built-in commands that work without a sandbox
const BUILTIN_COMMANDS: Record<string, (args: string) => string> = {
  echo: (args) => args,
  pwd: () => '/home/pablo/workspace',
  whoami: () => 'pablo',
  date: () => new Date().toISOString(),
  uname: () => 'Pablo IDE v5.0 (Virtual Terminal)',
  ls: () =>
    [
      'config.py    models.py    schemas.py',
      'auth.py      services.py  routes.py',
      'seed.py      main.py      requirements.txt',
    ].join('\n'),
  cat: (args) => {
    if (!args) return 'cat: missing operand';
    return `# Contents of ${args}\n# (File content would be loaded from session files)`;
  },
  python: (args) => {
    if (args === '--version') return 'Python 3.12.0 (Pablo Virtual Environment)';
    return 'Python interactive mode not available in virtual terminal.\nUse the chat to generate and run code.';
  },
  pip: (args) => {
    if (args === 'list') {
      return [
        'Package          Version',
        '---------------- --------',
        'fastapi          0.115.0',
        'uvicorn          0.34.0',
        'sqlalchemy       2.0.36',
        'pydantic         2.10.0',
        'passlib          1.7.4',
        'python-jose      3.3.0',
        'bcrypt           4.2.0',
      ].join('\n');
    }
    if (args.startsWith('install')) return `Successfully installed ${args.slice(8)}`;
    return 'Usage: pip install <package> | pip list';
  },
  node: (args) => {
    if (args === '--version') return 'v20.18.0';
    return 'Node.js interactive mode not available in virtual terminal.';
  },
  npm: (args) => {
    if (args === '--version') return '10.8.2';
    return 'npm commands would execute in the project sandbox.';
  },
  git: (args) => {
    if (args === 'status') return 'On branch main\nnothing to commit, working tree clean';
    if (args === 'log --oneline -5')
      return [
        'abc1234 feat: initial project setup',
        'def5678 feat: add database models',
        'ghi9012 feat: add API routes',
        'jkl3456 feat: add authentication',
        'mno7890 feat: add seed data',
      ].join('\n');
    return `git ${args}: command would execute in sandbox`;
  },
  help: () =>
    [
      'Available commands:',
      '  echo, pwd, whoami, date, uname, ls, cat, python, pip, node, npm, git, help, clear',
      '',
      'Note: Full shell access requires a Docker sandbox connection.',
      'Configure SANDBOX_URL in environment to enable real command execution.',
    ].join('\n'),
};

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const body = (await request.json()) as TerminalRequest;
  const { command } = body;

  if (!command || !command.trim()) {
    return Response.json({ output: '', exitCode: 0 });
  }

  const trimmed = command.trim();
  const parts = trimmed.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1).join(' ');

  // Check for sandbox URL (real execution via Docker/Fly.io/Durable Object)
  const sandboxUrl = await resolveSandboxUrl();
  if (sandboxUrl) {
    try {
      const sandboxResponse = await fetch(`${sandboxUrl}/exec`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Pablo-IDE/2.0',
        },
        body: JSON.stringify({
          command: trimmed,
          cwd: body.cwd || '/home/pablo/workspace',
          sessionId: body.sessionId,
        }),
        signal: AbortSignal.timeout(30_000), // 30s timeout for sandbox commands
      });
      if (sandboxResponse.ok) {
        const result = (await sandboxResponse.json()) as {
          output: string;
          exitCode: number;
        };
        return Response.json(result);
      }
      // If sandbox returns error, include the status
      return Response.json({
        output: `Sandbox error: ${sandboxResponse.status} ${sandboxResponse.statusText}`,
        exitCode: 1,
      });
    } catch (e) {
      // Timeout or network error — fall through to built-in commands
      const isTimeout = e instanceof DOMException && e.name === 'AbortError';
      if (isTimeout) {
        return Response.json({
          output: 'Command timed out after 30 seconds',
          exitCode: 124,
        });
      }
      // Fall through to built-in commands
    }
  }

  // Built-in command execution
  if (cmd === 'clear') {
    return Response.json({ output: '\x1b[2J\x1b[H', exitCode: 0 });
  }

  const handler = BUILTIN_COMMANDS[cmd];
  if (handler) {
    return Response.json({ output: handler(args), exitCode: 0 });
  }

  return Response.json({
    output: `pablo: command not found: ${cmd}\nType "help" for available commands`,
    exitCode: 127,
  });
}

/**
 * GET /api/terminal - Returns terminal capabilities and sandbox connection status
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  const sandboxUrl = await resolveSandboxUrl();
  const hasSandbox = !!sandboxUrl;

  // If sandbox is configured, try to ping it
  let sandboxStatus: 'connected' | 'unreachable' | 'not_configured' = 'not_configured';
  if (hasSandbox) {
    try {
      const ping = await fetch(`${sandboxUrl}/health`, {
        signal: AbortSignal.timeout(5_000),
      });
      sandboxStatus = ping.ok ? 'connected' : 'unreachable';
    } catch {
      sandboxStatus = 'unreachable';
    }
  }

  return Response.json({
    mode: hasSandbox ? 'sandbox' : 'builtin',
    sandboxStatus,
    builtinCommands: Object.keys(BUILTIN_COMMANDS),
    capabilities: {
      realExecution: hasSandbox,
      fileSystem: hasSandbox,
      networking: hasSandbox,
      processManagement: hasSandbox,
      builtinFallback: true,
    },
  });
}
