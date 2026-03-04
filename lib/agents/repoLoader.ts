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
    `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
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
        `https://api.github.com/repos/${repo}/contents/${blob.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
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
 * Load repo files from the client-side via Pablo's API routes.
 * Uses the Git Trees API for single-call tree loading (v7 Part 3),
 * then fetches file contents in parallel batches.
 */
export async function loadRepoFilesViaAPI(
  repo: string,
  branch: string,
  options: {
    maxFiles?: number;
    onProgress?: (msg: string) => void;
  } = {},
): Promise<RepoFile[]> {
  const maxFiles = options.maxFiles ?? 200;
  const onProgress = options.onProgress;

  onProgress?.(`Loading repository tree for ${repo}@${branch}...`);

  // Step 1: Get full tree in a single API call via Trees API
  const treeRes = await fetch(
    `/api/github/tree?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&recursive=true`,
  );

  if (!treeRes.ok) {
    throw new Error(`Failed to load repo tree: ${treeRes.status}`);
  }

  const treeData = (await treeRes.json()) as {
    tree: Array<{ path: string; type: 'blob' | 'tree'; sha: string; size?: number }>;
    truncated: boolean;
  };

  // Step 2: Filter to code files only
  const blobs = treeData.tree
    .filter((item) => item.type === 'blob')
    .filter((item) => !shouldSkip(item.path))
    .filter((item) => item.size === undefined || item.size <= 100_000); // skip files > 100KB

  onProgress?.(`Found ${blobs.length} code files (${treeData.tree.length} total in repo)`);

  // Step 3: Sort by size (smaller first) and take up to maxFiles
  const sorted = blobs.sort((a, b) => (a.size ?? 0) - (b.size ?? 0));
  const selected = sorted.slice(0, maxFiles);

  // Step 4: Load file contents in parallel batches via Contents API
  const files: RepoFile[] = [];
  const BATCH_SIZE = 10;

  for (let i = 0; i < selected.length; i += BATCH_SIZE) {
    const batch = selected.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (blob) => {
        const encodedPath = blob.path.split('/').map(encodeURIComponent).join('/');
        const fileRes = await fetch(
          `/api/github/contents?repo=${encodeURIComponent(repo)}&branch=${encodeURIComponent(branch)}&path=${encodedPath}`,
        );
        if (!fileRes.ok) return null;

        const fileData = (await fileRes.json()) as {
          content?: string;
          encoding?: string;
        };

        if (fileData.content && fileData.encoding === 'base64') {
          const decoded = decodeBase64(fileData.content);
          return {
            path: blob.path,
            content: decoded,
            language: detectLanguage(blob.path),
          };
        }
        return null;
      }),
    );

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value) {
        files.push(result.value);
      }
    }

    if (files.length > 0 && i + BATCH_SIZE < selected.length) {
      onProgress?.(`Loaded ${files.length}/${selected.length} files...`);
    }
  }

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
      const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
      return new TextDecoder().decode(bytes);
    }
    return Buffer.from(clean, 'base64').toString('utf-8');
  } catch {
    return '';
  }
}
