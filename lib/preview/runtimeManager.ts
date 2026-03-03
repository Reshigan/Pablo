/**
 * Preview Runtime Manager
 * Auto-detects the best runtime for generated code:
 *   - WebContainers for Node.js/React/TS projects
 *   - Pyodide for Python code
 *   - srcDoc for static HTML/CSS/JS
 */

export type PreviewRuntime = 'webcontainer' | 'pyodide' | 'srcdoc';

export interface PreviewFile {
  path: string;
  name: string;
  content: string;
  language: string;
}

/**
 * Detect the best runtime based on the files present.
 */
export function detectRuntime(files: PreviewFile[]): PreviewRuntime {
  const extensions = new Set(files.map(f => {
    const parts = f.name.split('.');
    return parts.length > 1 ? `.${parts.pop()}` : '';
  }));

  const hasPackageJson = files.some(f => f.name === 'package.json');
  const hasPython = extensions.has('.py');
  const hasJSX = extensions.has('.jsx') || extensions.has('.tsx');
  const hasTS = extensions.has('.ts') || extensions.has('.tsx');
  const hasNodeImports = files.some(f =>
    f.content.includes('import ') && f.content.includes(' from ') &&
    (f.name.endsWith('.js') || f.name.endsWith('.ts') || f.name.endsWith('.jsx') || f.name.endsWith('.tsx'))
  );

  // If there's a package.json or JSX/TSX or Node-style imports -> WebContainers
  if (hasPackageJson || hasJSX || hasTS || hasNodeImports) {
    return 'webcontainer';
  }

  // If there's Python -> Pyodide
  if (hasPython) {
    return 'pyodide';
  }

  // Fallback: static srcDoc for plain HTML/CSS/JS
  return 'srcdoc';
}

/**
 * Convert Pablo's flat file list into WebContainer FileSystemTree format.
 */
export function toFileSystemTree(files: PreviewFile[]): Record<string, unknown> {
  const tree: Record<string, unknown> = {};

  for (const file of files) {
    const parts = file.path.split('/').filter(Boolean);
    let current = tree;

    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts[i];
      if (!current[dir]) {
        current[dir] = { directory: {} };
      }
      current = (current[dir] as { directory: Record<string, unknown> }).directory;
    }

    const fileName = parts[parts.length - 1] || file.name;
    current[fileName] = {
      file: { contents: file.content },
    };
  }

  return tree;
}

/**
 * Generate a minimal package.json + vite.config if missing.
 * This scaffolds a runnable Vite project from loose React/TS files.
 */
export function scaffoldProject(files: PreviewFile[]): PreviewFile[] {
  const hasPackageJson = files.some(f => f.name === 'package.json');
  const hasViteConfig = files.some(f => f.name.startsWith('vite.config'));
  const hasIndexHtml = files.some(f => f.path === 'index.html' || f.path === '/index.html');
  const hasJSX = files.some(f => f.name.endsWith('.jsx') || f.name.endsWith('.tsx'));
  const hasTS = files.some(f => f.name.endsWith('.ts') || f.name.endsWith('.tsx'));

  const extras: PreviewFile[] = [];

  if (!hasPackageJson) {
    const deps: Record<string, string> = {};
    const devDeps: Record<string, string> = {
      'vite': '^5.0.0',
    };

    if (hasJSX) {
      deps['react'] = '^18.2.0';
      deps['react-dom'] = '^18.2.0';
      devDeps['@vitejs/plugin-react'] = '^4.2.0';
    }

    if (hasTS) {
      devDeps['typescript'] = '^5.3.0';
    }

    extras.push({
      path: 'package.json',
      name: 'package.json',
      content: JSON.stringify({
        name: 'pablo-preview',
        private: true,
        version: '0.0.0',
        type: 'module',
        scripts: {
          dev: 'vite --host 0.0.0.0',
          build: 'vite build',
        },
        dependencies: deps,
        devDependencies: devDeps,
      }, null, 2),
      language: 'json',
    });
  }

  if (!hasViteConfig && hasJSX) {
    extras.push({
      path: 'vite.config.js',
      name: 'vite.config.js',
      content: `import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
});
`,
      language: 'javascript',
    });
  }

  if (!hasIndexHtml) {
    const entryFile = files.find(f =>
      f.name === 'main.tsx' || f.name === 'main.jsx' ||
      f.name === 'App.tsx' || f.name === 'App.jsx' ||
      f.name === 'index.tsx' || f.name === 'index.jsx'
    );
    const scriptSrc = entryFile ? `/${entryFile.path}` : '/main.tsx';

    extras.push({
      path: 'index.html',
      name: 'index.html',
      content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Pablo Preview</title>
  <script src="https://cdn.tailwindcss.com"><\/script>
</head>
<body>
  <div id="root"></div>
  <script type="module" src="${scriptSrc}"><\/script>
</body>
</html>`,
      language: 'html',
    });

    // Add main.tsx entry if no entry point exists
    if (!entryFile) {
      const appFile = files.find(f => f.name.startsWith('App.'));
      if (appFile) {
        extras.push({
          path: 'main.tsx',
          name: 'main.tsx',
          content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './${appFile.path.replace(/\.[^.]+$/, '')}';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
`,
          language: 'typescriptreact',
        });
      }
    }
  }

  return [...files, ...extras];
}
