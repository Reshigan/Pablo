// lib/agents/repoLoader.ts
// Loads entire repository tree from GitHub recursively
// Filters out irrelevant files (node_modules, .git, dist, images, binaries)

import { detectLanguage } from './contextAnalyzer';

export interface RepoFile {
  path: string;
  content: string;
  language: string;
}

/** Directories to always skip */
const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', '.next', '.nuxt',
  '.cache', '.turbo', '__pycache__', '.pytest_cache', '.mypy_cache',
  'venv', '.venv', 'env', '.tox', 'coverage', '.nyc_output',
  '.svn', '.hg', 'vendor', 'target', 'out',
]);

/** File extensions to skip (binary/image/media) */
const SKIP_EXTENSIONS = new Set([
  'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico', 'webp', 'bmp', 'tiff',
  'mp3', 'mp4', 'wav', 'avi', 'mov', 'mkv', 'webm',
  'zip', 'tar', 'gz', 'rar', '7z', 'bz2',
  'woff', 'woff2', 'ttf', 'eot', 'otf',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'exe', 'dll', 'so', 'dylib', 'bin', 'o', 'a',
  'lock', // package-lock.json, yarn.lock etc are huge
]);

/** Files to always skip by name */
const SKIP_FILES = new Set([
  'package-lock.json', 'yarn.lock', 'pnpm-lock.yaml',
  'Cargo.lock', 'poetry.lock', 'Pipfile.lock',
  'composer.lock', 'Gemfile.lock',
]);

interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree';
  sha: string;
  size?: number;
  url: string;
}

interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  truncated: boolean;
}

/**
 * Check if a path should be skipped
 */
function shouldSkip(path: string): boolean {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];
  const ext = filename.split('.').pop()?.toLowerCase() || '';

  // Skip directories
  for (const part of parts) {
    if (SKIP_DIRS.has(part)) return true;
  }

  // Skip by extension
  if (SKIP_EXTENSIONS.has(ext)) return true;

  // Skip by filename
  if (SKIP_FILES.has(filename)) return true;

  // Skip dotfiles (except config files)
  if (filename.startsWith('.') && !filename.startsWith('.env') && !filename.startsWith('.eslint') && !filename.startsWith('.prettier')) {
    return true;
  }

  return false;
}

/**
 * Load all files from a GitHub repository using the Git Trees API
 * This is much faster than recursively calling the Contents API
 */
export async function loadRepoFiles(
  repo: string,
  branch: string,
  accessToken: string,
  options: {
    maxFiles?: number;
    maxFileSize?: number;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<RepoFile[]> {
  const maxFiles = options.maxFiles ?? 100;
  const maxFileSize = options.maxFileSize ?? 100_000; // 100KB per file
  const onProgress = options.onProgress;

  onProgress?.(`Loading repository tree for ${repo}@${branch}...`);

  // Step 1: Get the full tree recursively
  const treeRes = await fetch(
    `https://api.github.com/repos/${repo}/git/trees/${branch}?recursive=1`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Pablo-IDE/2.0',
      },
    },
  );

  if (!treeRes.ok) {
    throw new Error(`Failed to load repo tree: ${treeRes.status}`);
  }

  const treeData = (await treeRes.json()) as GitHubTreeResponse;

  // Step 2: Filter to relevant files
  const blobs = treeData.tree.filter(
    (item) =>
      item.type === 'blob' &&
      !shouldSkip(item.path) &&
      (item.size === undefined || item.size <= maxFileSize),
  );

  onProgress?.(`Found ${blobs.length} relevant files (${treeData.tree.length} total in repo)`);

  // Step 3: Take only up to maxFiles, prioritizing smaller files and source code
  const sorted = blobs.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  const selected = sorted.slice(0, maxFiles);

  // Step 4: Load file contents via Contents API (base64 decode)
  const files: RepoFile[] = [];
  let loaded = 0;

  for (const blob of selected) {
    try {
      const contentRes = await fetch(
        `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(blob.path)}?ref=${encodeURIComponent(branch)}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
            'User-Agent': 'Pablo-IDE/2.0',
          },
        },
      );

      if (!contentRes.ok) continue;

      const contentData = (await contentRes.json()) as {
        content?: string;
        encoding?: string;
      };

      if (contentData.content && contentData.encoding === 'base64') {
        // Decode base64 content
        const decoded = decodeBase64(contentData.content);
        const language = detectLanguage(blob.path);

        files.push({
          path: blob.path,
          content: decoded,
          language,
        });

        loaded++;
        if (loaded % 10 === 0) {
          onProgress?.(`Loaded ${loaded}/${selected.length} files...`);
        }
      }
    } catch {
      // Skip files that fail to load
      continue;
    }
  }

  onProgress?.(`Loaded ${files.length} files from ${repo}@${branch}`);
  return files;
}

/**
 * Load repo files from the client-side via Pablo's API routes
 * (for use in browser context where we don't have direct GitHub token access)
 */
export async function loadRepoFilesViaAPI(
  repo: string,
  branch: string,
  options: {
    maxFiles?: number;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<RepoFile[]> {
  const maxFiles = options.maxFiles ?? 100;
  const onProgress = options.onProgress;

  onProgress?.(`Loading files from ${repo}@${branch}...`);

  // Use Pablo's contents API to get root directory listing
  const rootRes = await fetch(
    `/api/github/contents?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=`,
  );

  if (!rootRes.ok) {
    throw new Error(`Failed to load repo contents: ${rootRes.status}`);
  }

  const rootItems = (await rootRes.json()) as Array<{
    type: string;
    path: string;
    name: string;
    size?: number;
  }>;

  const files: RepoFile[] = [];

  // Recursively load files
  async function loadDir(items: typeof rootItems): Promise<void> {
    for (const item of items) {
      if (files.length >= maxFiles) break;
      if (shouldSkip(item.path)) continue;

      if (item.type === 'file') {
        try {
          const fileRes = await fetch(
            `/api/github/contents?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(item.path)}`,
          );
          if (!fileRes.ok) continue;

          const fileData = (await fileRes.json()) as {
            content?: string;
            encoding?: string;
            name: string;
          };

          if (fileData.content && fileData.encoding === 'base64') {
            const decoded = decodeBase64(fileData.content);
            files.push({
              path: item.path,
              content: decoded,
              language: detectLanguage(item.path),
            });

            if (files.length % 10 === 0) {
              onProgress?.(`Loaded ${files.length} files...`);
            }
          }
        } catch {
          // Skip individual file failures
        }
      } else if (item.type === 'dir') {
        try {
          const dirRes = await fetch(
            `/api/github/contents?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodeURIComponent(item.path)}`,
          );
          if (!dirRes.ok) continue;
          const dirItems = (await dirRes.json()) as typeof rootItems;
          await loadDir(dirItems);
        } catch {
          // Skip directory failures
        }
      }
    }
  }

  await loadDir(rootItems);
  onProgress?.(`Loaded ${files.length} files from ${repo}@${branch}`);
  return files;
}

/**
 * Decode base64 content (handles Unicode correctly)
 */
function decodeBase64(base64: string): string {
  try {
    // Remove newlines that GitHub adds
    const clean = base64.replace(/\n/g, '');
    // Use atob for browser, Buffer for Node
    if (typeof atob !== 'undefined') {
      return atob(clean);
    }
    return Buffer.from(clean, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}
