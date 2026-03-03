/**
 * WebContainer Runtime — runs Node.js in the browser.
 * Handles: npm install, Vite dev server, TypeScript, React, etc.
 */

import type { WebContainer, WebContainerProcess, FileSystemTree } from '@webcontainer/api';
import type { PreviewFile } from './runtimeManager';
import { toFileSystemTree, scaffoldProject } from './runtimeManager';

let instance: WebContainer | null = null;
let serverProcess: WebContainerProcess | null = null;

export interface WebContainerCallbacks {
  onTerminalOutput: (data: string) => void;
  onServerReady: (url: string, port: number) => void;
  onError: (error: string) => void;
  onStatusChange: (status: 'booting' | 'installing' | 'starting' | 'ready' | 'error') => void;
}

/**
 * Boot a WebContainer instance (singleton — only one per page).
 */
async function getContainer(): Promise<WebContainer> {
  if (instance) return instance;

  const { WebContainer } = await import('@webcontainer/api');
  instance = await WebContainer.boot();
  return instance;
}

/**
 * Mount files, install deps, start dev server.
 */
export async function startPreview(
  files: PreviewFile[],
  callbacks: WebContainerCallbacks,
): Promise<void> {
  try {
    callbacks.onStatusChange('booting');
    const container = await getContainer();

    // Kill previous server if running
    if (serverProcess) {
      serverProcess.kill();
      serverProcess = null;
    }

    // Scaffold missing project files (package.json, vite.config, index.html)
    const allFiles = scaffoldProject(files);

    // Mount files into the container
    const tree = toFileSystemTree(allFiles) as FileSystemTree;
    await container.mount(tree);

    // Install dependencies
    callbacks.onStatusChange('installing');
    callbacks.onTerminalOutput('$ npm install\n');

    const installProcess = await container.spawn('npm', ['install']);
    installProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          callbacks.onTerminalOutput(data);
        },
      })
    );

    const installExitCode = await installProcess.exit;
    if (installExitCode !== 0) {
      callbacks.onError(`npm install failed with exit code ${installExitCode}`);
      callbacks.onStatusChange('error');
      return;
    }

    // Start dev server
    callbacks.onStatusChange('starting');
    callbacks.onTerminalOutput('\n$ npm run dev\n');

    serverProcess = await container.spawn('npm', ['run', 'dev']);
    serverProcess.output.pipeTo(
      new WritableStream({
        write(data) {
          callbacks.onTerminalOutput(data);
        },
      })
    );

    // Listen for the dev server URL
    container.on('server-ready', (port: number, url: string) => {
      callbacks.onServerReady(url, port);
      callbacks.onStatusChange('ready');
    });

  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : 'WebContainer failed to start');
    callbacks.onStatusChange('error');
  }
}

/**
 * Write a single file into the running container (for hot updates).
 */
export async function writeFile(path: string, content: string): Promise<void> {
  if (!instance) return;
  await instance.fs.writeFile(path, content);
}

/**
 * Run a command in the container's shell.
 */
export async function runCommand(
  command: string,
  args: string[],
  onOutput: (data: string) => void,
): Promise<number> {
  if (!instance) throw new Error('WebContainer not booted');

  const process = await instance.spawn(command, args);
  process.output.pipeTo(
    new WritableStream({
      write(data) {
        onOutput(data);
      },
    })
  );

  return process.exit;
}

/**
 * Tear down the container (called when user navigates away).
 */
export async function teardown(): Promise<void> {
  if (serverProcess) {
    serverProcess.kill();
    serverProcess = null;
  }
  if (instance) {
    instance.teardown();
    instance = null;
  }
}
