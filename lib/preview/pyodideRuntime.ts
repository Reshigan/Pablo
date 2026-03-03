/**
 * Pyodide Runtime — runs Python (CPython) in the browser via WebAssembly.
 * Handles: Python scripts, tests, pandas, numpy, data processing.
 * Does NOT handle: HTTP servers (FastAPI serving), system binaries.
 */

let pyodideInstance: unknown | null = null;

export interface PyodideCallbacks {
  onOutput: (text: string) => void;
  onError: (text: string) => void;
  onStatusChange: (status: 'loading' | 'installing' | 'running' | 'done' | 'error') => void;
}

interface PyodideInterface {
  setStdout: (opts: { batched: (text: string) => void }) => void;
  setStderr: (opts: { batched: (text: string) => void }) => void;
  pyimport: (name: string) => { install: (pkg: string) => Promise<void> };
  runPythonAsync: (code: string) => Promise<{ toString: () => string } | null>;
  FS: {
    mkdirTree: (path: string) => void;
    writeFile: (path: string, content: string, opts: { encoding: string }) => void;
  };
}

/**
 * Load and initialize Pyodide (lazy, singleton).
 */
async function getPyodide(): Promise<PyodideInterface> {
  if (pyodideInstance) return pyodideInstance as PyodideInterface;

  // Load Pyodide from CDN
  const { loadPyodide } = await import('pyodide');
  pyodideInstance = await (loadPyodide as (opts: { indexURL: string }) => Promise<PyodideInterface>)({
    indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.29.3/full/',
  });

  return pyodideInstance as PyodideInterface;
}

/**
 * Detect Python imports and install required packages.
 */
function detectPythonImports(code: string): string[] {
  const importRegex = /(?:^|\n)\s*(?:import|from)\s+(\w+)/g;
  const stdlibModules = new Set([
    'os', 'sys', 'json', 'math', 'datetime', 'collections', 'itertools',
    'functools', 'typing', 'pathlib', 'io', 're', 'time', 'random',
    'hashlib', 'base64', 'uuid', 'dataclasses', 'abc', 'enum', 'copy',
    'string', 'textwrap', 'unittest', 'logging', 'argparse', 'csv',
    'sqlite3', 'decimal', 'fractions', 'statistics', 'operator',
  ]);

  const imports = new Set<string>();
  let match: RegExpExecArray | null;
  while ((match = importRegex.exec(code)) !== null) {
    const pkg = match[1];
    if (!stdlibModules.has(pkg)) {
      imports.add(pkg);
    }
  }

  // Map common import names to pip package names
  const packageMap: Record<string, string> = {
    'fastapi': 'fastapi',
    'pydantic': 'pydantic',
    'pd': 'pandas',
    'pandas': 'pandas',
    'np': 'numpy',
    'numpy': 'numpy',
    'scipy': 'scipy',
    'sklearn': 'scikit-learn',
    'matplotlib': 'matplotlib',
    'plt': 'matplotlib',
    'requests': 'requests',
    'httpx': 'httpx',
    'yaml': 'pyyaml',
    'sqlalchemy': 'sqlalchemy',
  };

  return [...imports].map(i => packageMap[i] || i);
}

/**
 * Run Python code with Pyodide.
 */
export async function runPython(
  code: string,
  callbacks: PyodideCallbacks,
): Promise<string> {
  try {
    callbacks.onStatusChange('loading');
    const pyodide = await getPyodide();

    // Redirect stdout/stderr to callbacks
    pyodide.setStdout({ batched: (text: string) => callbacks.onOutput(text + '\n') });
    pyodide.setStderr({ batched: (text: string) => callbacks.onError(text + '\n') });

    // Install required packages
    const packages = detectPythonImports(code);
    if (packages.length > 0) {
      callbacks.onStatusChange('installing');
      callbacks.onOutput(`Installing: ${packages.join(', ')}...\n`);
      const micropip = pyodide.pyimport('micropip');
      for (const pkg of packages) {
        try {
          await micropip.install(pkg);
          callbacks.onOutput(`  Installed ${pkg}\n`);
        } catch {
          callbacks.onOutput(`  Could not install ${pkg} (may not be available in Pyodide)\n`);
        }
      }
    }

    // Run the code
    callbacks.onStatusChange('running');
    const result = await pyodide.runPythonAsync(code);
    callbacks.onStatusChange('done');

    return result?.toString() ?? '';
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    callbacks.onError(errorMsg);
    callbacks.onStatusChange('error');
    return '';
  }
}

/**
 * Run multiple Python files — execute main.py or the first .py file.
 */
export async function runPythonProject(
  files: Array<{ path: string; content: string }>,
  callbacks: PyodideCallbacks,
): Promise<string> {
  callbacks.onStatusChange('loading');
  const pyodide = await getPyodide();

  // Write all files to Pyodide's virtual filesystem
  for (const file of files) {
    // Create directories if needed
    const dir = file.path.substring(0, file.path.lastIndexOf('/'));
    if (dir) {
      try {
        pyodide.FS.mkdirTree(dir);
      } catch {
        // Directory may already exist
      }
    }
    pyodide.FS.writeFile(file.path, file.content, { encoding: 'utf8' });
  }

  // Find the entry point
  const mainFile = files.find(f => f.path === 'main.py' || f.path.endsWith('/main.py'))
    || files.find(f => f.path === 'app.py' || f.path.endsWith('/app.py'))
    || files.find(f => f.path.endsWith('.py'));

  if (!mainFile) {
    callbacks.onError('No Python file found to execute');
    return '';
  }

  callbacks.onOutput(`Running ${mainFile.path}...\n\n`);
  return runPython(mainFile.content, callbacks);
}
