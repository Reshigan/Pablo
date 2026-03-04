/**
 * Cloudflare Pages Direct Upload — Deploy generated code to Cloudflare Pages
 *
 * POST /api/deploy/cloudflare
 * Body: { files: [{ path, content }], project_name, account_id?, api_key? }
 *
 * Flow:
 * 1. Create Cloudflare Pages project (if not exists)
 * 2. Upload files via Direct Upload API
 * 3. Return the live deployment URL
 */
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

interface DeployFile {
  path: string;
  content: string;
}

interface CloudflareEnv {
  accountId: string;
  apiKey: string;
  email: string;
}

async function getCloudflareEnv(): Promise<CloudflareEnv> {
  // Try Cloudflare Worker env first, then process.env
  let accountId = '';
  let apiKey = '';
  let email = '';

  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    accountId = cfEnv.CF_ACCOUNT_ID || '';
    apiKey = cfEnv.CF_API_KEY || '';
    email = cfEnv.CF_EMAIL || '';
  } catch {
    // Not in Cloudflare Worker
  }

  accountId = accountId || process.env.CF_ACCOUNT_ID || '';
  apiKey = apiKey || process.env.CF_API_KEY || '';
  email = email || process.env.CF_EMAIL || '';

  return { accountId, apiKey, email };
}

async function cfAPI(
  url: string,
  apiKey: string,
  email: string,
  options: RequestInit = {}
): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      'X-Auth-Key': apiKey,
      'X-Auth-Email': email,
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

/**
 * Generate a minimal index.html that bundles all the generated component files
 * into a single-page application using inline scripts and styles.
 */
function generateSPABundle(files: DeployFile[], projectName: string): DeployFile[] {
  const bundledFiles: DeployFile[] = [];

  // Collect CSS files
  const cssFiles = files.filter(f => f.path.endsWith('.css'));
  const cssContent = cssFiles.map(f => f.content).join('\n');

  // Collect TSX/JSX/TS/JS files
  const codeFiles = files.filter(
    f => f.path.match(/\.(tsx?|jsx?)$/) && !f.path.includes('test') && !f.path.includes('spec')
  );

  // Check if there's already an index.html
  const existingHtml = files.find(f => f.path.endsWith('index.html'));
  if (existingHtml) {
    // Use existing HTML, just ensure all files are included
    bundledFiles.push({ path: 'index.html', content: existingHtml.content });
    for (const file of files) {
      if (file.path !== existingHtml.path) {
        bundledFiles.push(file);
      }
    }
    return bundledFiles;
  }

  // Build a static HTML page that includes all component code inline
  // Since we can't run a build step on Cloudflare Pages Direct Upload,
  // we create a self-contained HTML file with embedded React via CDN
  //
  // Transform ES module syntax to browser-compatible globals:
  // - Strip import/export statements (React etc. are loaded via CDN UMD)
  // - Convert TypeScript type annotations to JS (Babel standalone handles this)
  // - Escape backticks and ${} to prevent template literal injection
  const componentCode = codeFiles
    .map(f => {
      let code = f.content;
      // Strip ES module imports (React, recharts, etc. are UMD globals)
      code = code.replace(/^\s*import\s+.*?from\s+['"].*?['"];?\s*$/gm, '');
      code = code.replace(/^\s*import\s+['"].*?['"];?\s*$/gm, '');
      // Convert `export default function X` → `function X`
      code = code.replace(/^\s*export\s+default\s+/gm, '');
      // Convert `export function X` → `function X`
      code = code.replace(/^\s*export\s+(?=(?:function|const|let|var|class|interface|type|enum)\s)/gm, '');
      // Strip standalone `export { ... }` lines
      code = code.replace(/^\s*export\s*\{[^}]*\};?\s*$/gm, '');
      // Strip TypeScript-only constructs that Babel standalone doesn't handle
      code = code.replace(/^\s*(?:interface|type)\s+\w+[^{]*\{[^}]*\}\s*$/gm, '');
      // Escape backticks and template expressions to prevent injection
      code = code.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
      return `// --- ${f.path} ---\n${code}`;
    })
    .join('\n\n');

  const html = `<!DOCTYPE html>
<html lang="en" class="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${projectName}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          colors: {
            primary: { 50: '#eff6ff', 100: '#dbeafe', 200: '#bfdbfe', 300: '#93c5fd', 400: '#60a5fa', 500: '#3b82f6', 600: '#2563eb', 700: '#1d4ed8', 800: '#1e40af', 900: '#1e3a8a' },
            surface: { DEFAULT: '#1e1e2e', lighter: '#2a2a3e', border: '#3a3a4e' },
          }
        }
      }
    }
  </script>
  <script src="https://unpkg.com/react@18/umd/react.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js" crossorigin></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://unpkg.com/recharts@2.12.7/umd/Recharts.min.js" crossorigin></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0f172a; color: #e2e8f0; min-height: 100vh; }
    ${cssContent}
  </style>
</head>
<body>
  <div id="root"></div>
  <script type="text/babel" data-type="module">
    const { useState, useEffect, useCallback, useMemo, useRef, createContext, useContext } = React;
    const { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, AreaChart, Area } = Recharts || {};

    // ============================================================
    // Generated Code from Pablo IDE Pipeline
    // ============================================================

    ${componentCode}

    // ============================================================
    // Mount App
    // ============================================================
    const rootEl = document.getElementById('root');
    if (rootEl) {
      const root = ReactDOM.createRoot(rootEl);
      // Try to find the main App component
      if (typeof App !== 'undefined') {
        root.render(React.createElement(App));
      } else if (typeof Dashboard !== 'undefined') {
        root.render(React.createElement(Dashboard));
      } else if (typeof Main !== 'undefined') {
        root.render(React.createElement(Main));
      } else {
        root.render(React.createElement('div', {
          style: { display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: '#94a3b8' }
        }, 'No App component found. Check the generated code.'));
      }
    }
  </script>
</body>
</html>`;

  bundledFiles.push({ path: 'index.html', content: html });

  // Also include a _redirects for SPA routing
  bundledFiles.push({ path: '_redirects', content: '/*    /index.html   200' });

  return bundledFiles;
}

export async function POST(request: NextRequest) {
  // Auth guard — only authenticated users can deploy
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized — sign in to deploy' }, { status: 401 });
  }

  const body = (await request.json()) as {
    files: DeployFile[];
    project_name?: string;
    account_id?: string;
    api_key?: string;
    email?: string;
  };

  const { files } = body;
  if (!files?.length) {
    return Response.json({ error: 'No files to deploy' }, { status: 400 });
  }

  // Get Cloudflare credentials
  const env = await getCloudflareEnv();
  const accountId = body.account_id || env.accountId;
  const apiKey = body.api_key || env.apiKey;
  const email = body.email || env.email;

  if (!accountId || !apiKey || !email) {
    return Response.json({
      error: 'Cloudflare credentials not configured. Set CF_ACCOUNT_ID, CF_API_KEY, CF_EMAIL.',
    }, { status: 400 });
  }

  const projectName = (body.project_name ?? `pablo-${Date.now()}`)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 58);

  try {
    // Step 1: Bundle files into deployable assets
    const deployFiles = generateSPABundle(files, projectName);

    // Step 2: Create project if it doesn't exist
    const projectUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}`;
    const projectCheck = await cfAPI(projectUrl, apiKey, email);

    if (!projectCheck.ok) {
      // Create the project
      const createRes = await cfAPI(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects`,
        apiKey,
        email,
        {
          method: 'POST',
          body: JSON.stringify({
            name: projectName,
            production_branch: 'main',
          }),
        }
      );
      if (!createRes.ok) {
        const err = (await createRes.json()) as { errors?: Array<{ message: string }> };
        const msg = err.errors?.[0]?.message ?? 'Failed to create project';
        // If project already exists, continue
        if (!msg.includes('already exists') && !msg.includes('already being used')) {
          throw new Error(msg);
        }
      }
    }

    // Step 3: Upload via Direct Upload (multipart form)
    const formData = new FormData();

    for (const file of deployFiles) {
      const blob = new Blob([file.content], { type: getMimeType(file.path) });
      // Cloudflare Pages Direct Upload uses the file path as the key
      formData.append(file.path, blob, file.path);
    }

    const uploadUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/pages/projects/${projectName}/deployments`;
    const uploadRes = await fetch(uploadUrl, {
      method: 'POST',
      headers: {
        'X-Auth-Key': apiKey,
        'X-Auth-Email': email,
      },
      body: formData,
    });

    if (!uploadRes.ok) {
      const err = (await uploadRes.json()) as { errors?: Array<{ message: string }> };
      throw new Error(err.errors?.[0]?.message ?? `Upload failed (${uploadRes.status})`);
    }

    const deployResult = (await uploadRes.json()) as {
      result: {
        id: string;
        url: string;
        environment: string;
        project_name: string;
        aliases?: string[];
      };
    };

    const deployUrl = deployResult.result.url;
    const productionUrl = `https://${projectName}.pages.dev`;

    return Response.json({
      success: true,
      type: 'cloudflare-pages',
      project: projectName,
      deployment_id: deployResult.result.id,
      deployment_url: deployUrl,
      production_url: productionUrl,
      files_deployed: deployFiles.length,
      message: `Deployed ${deployFiles.length} files to ${productionUrl}`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}

function getMimeType(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    html: 'text/html',
    css: 'text/css',
    js: 'application/javascript',
    ts: 'application/javascript',
    tsx: 'application/javascript',
    jsx: 'application/javascript',
    json: 'application/json',
    svg: 'image/svg+xml',
    png: 'image/png',
    jpg: 'image/jpeg',
    ico: 'image/x-icon',
    txt: 'text/plain',
    md: 'text/markdown',
  };
  return map[ext] ?? 'application/octet-stream';
}
