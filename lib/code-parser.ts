/**
 * Code Parser — Extracts files from AI-generated markdown responses
 *
 * Parses multiple patterns:
 * 1. ### filename.ext  followed by a ```lang code block
 * 2. ```lang:filename.ext  (colon-separated language:filename)
 * 3. **filename.ext** or `filename.ext` followed by code block
 * 4. File: filename.ext or Filename: filename.ext followed by code block
 * 5. // filename.ext or # filename.ext comment at start of code block
 * 6. ```lang filename.ext  (space-separated language and filename — common LLM format)
 *
 * Returns an array of { filename, language, content } objects.
 */

export interface ParsedFile {
  filename: string;
  language: string;
  content: string;
}

/**
 * Detect language from filename extension
 */
function langFromExt(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    py: 'python',
    ts: 'typescript',
    tsx: 'typescriptreact',
    js: 'javascript',
    jsx: 'javascriptreact',
    json: 'json',
    sql: 'sql',
    css: 'css',
    scss: 'scss',
    html: 'html',
    md: 'markdown',
    yaml: 'yaml',
    yml: 'yaml',
    toml: 'toml',
    sh: 'shell',
    bash: 'shell',
    rs: 'rust',
    go: 'go',
    txt: 'plaintext',
    env: 'plaintext',
    cfg: 'ini',
    ini: 'ini',
    xml: 'xml',
    graphql: 'graphql',
    prisma: 'prisma',
    dockerfile: 'dockerfile',
  };
  return map[ext] ?? 'plaintext';
}

/** Check if a string looks like a file path */
function looksLikeFilePath(str: string): boolean {
  const trimmed = str.trim().replace(/[`*]/g, '');
  if (/^[\w./_-]+\.\w{1,10}$/.test(trimmed)) return true;
  const known = ['Dockerfile', 'Makefile', 'Procfile', '.gitignore', '.env'];
  return known.some(k => trimmed.endsWith(k));
}

/** Clean a filename from markdown formatting */
function cleanFilename(raw: string): string {
  return raw
    .replace(/[`*"']/g, '')
    .replace(/^\.?\//, '')
    .trim()
    .replace(/[),:;\]]+$/g, '');
}

/** Extract code block content starting after the opening fence */
function extractCodeBlock(lines: string[], startFence: number): { contentLines: string[]; endIndex: number } {
  const contentLines: string[] = [];
  let j = startFence + 1;
  while (j < lines.length && !lines[j].startsWith('```')) {
    contentLines.push(lines[j]);
    j++;
  }
  return { contentLines, endIndex: j + 1 };
}

/**
 * Parse generated markdown content and extract files
 */
export function parseGeneratedFiles(markdown: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const seen = new Set<string>();
  const lines = markdown.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Pattern 1: ### filename.ext  (header followed by code block)
    const headerMatch = line.match(/^#{1,4}\s+(.+\.\w+)\s*$/);
    if (headerMatch && looksLikeFilePath(headerMatch[1])) {
      const filename = cleanFilename(headerMatch[1]);
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        j++;
        if (j - i > 5) break;
      }
      if (j < lines.length && lines[j].startsWith('```')) {
        const fenceLang = lines[j].slice(3).split(':')[0].split(' ')[0].trim();
        const { contentLines, endIndex } = extractCodeBlock(lines, j);
        if (contentLines.length > 0 && !seen.has(filename)) {
          seen.add(filename);
          files.push({
            filename,
            language: fenceLang || langFromExt(filename),
            content: contentLines.join('\n'),
          });
        }
        i = endIndex;
        continue;
      }
    }

    // Pattern 2: ```lang:filename.ext  (inline filename in fence)
    const fenceMatch = line.match(/^```(\w+):(.+\.\w+)\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1];
      const filename = cleanFilename(fenceMatch[2]);
      const { contentLines, endIndex } = extractCodeBlock(lines, i);
      if (contentLines.length > 0 && !seen.has(filename)) {
        seen.add(filename);
        files.push({ filename, language, content: contentLines.join('\n') });
      }
      i = endIndex;
      continue;
    }

    // Pattern 2b: ```lang filename.ext (space-separated — most common LLM output)
    // e.g. ```tsx src/components/Dashboard.tsx or ```toml wrangler.toml
    const fenceSpaceMatch = line.match(/^```(\w+)\s+(.+)$/);
    if (fenceSpaceMatch) {
      const language = fenceSpaceMatch[1];
      // Take the first whitespace-delimited token as the filename, ignore trailing descriptions
      const rawFile = fenceSpaceMatch[2].trim().split(/\s+/)[0];
      const filename = cleanFilename(rawFile);
      if (looksLikeFilePath(filename)) {
        const { contentLines, endIndex } = extractCodeBlock(lines, i);
        if (contentLines.length > 0 && !seen.has(filename)) {
          seen.add(filename);
          files.push({
            filename,
            language: language || langFromExt(filename),
            content: contentLines.join('\n'),
          });
        }
        i = endIndex;
        continue;
      }
    }

    // Pattern 3: **filename.ext** or `filename.ext` followed by code block
    const boldMatch = line.match(/^\*\*(.+\.\w+)\*\*\s*:?\s*$/) ?? line.match(/^`(.+\.\w+)`\s*:?\s*$/);
    if (boldMatch && looksLikeFilePath(boldMatch[1])) {
      const filename = cleanFilename(boldMatch[1]);
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        j++;
        if (j - i > 5) break;
      }
      if (j < lines.length && lines[j].startsWith('```')) {
        const fenceLang = lines[j].slice(3).split(':')[0].split(' ')[0].trim();
        const { contentLines, endIndex } = extractCodeBlock(lines, j);
        if (contentLines.length > 0 && !seen.has(filename)) {
          seen.add(filename);
          files.push({
            filename,
            language: fenceLang || langFromExt(filename),
            content: contentLines.join('\n'),
          });
        }
        i = endIndex;
        continue;
      }
    }

    // Pattern 4: File: filename.ext or Filename: filename.ext
    const fileLabel = line.match(/^(?:File|Filename|Path|Create|Update|Edit)\s*:\s*`?(.+\.\w+)`?\s*$/i);
    if (fileLabel && looksLikeFilePath(fileLabel[1])) {
      const filename = cleanFilename(fileLabel[1]);
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        j++;
        if (j - i > 5) break;
      }
      if (j < lines.length && lines[j].startsWith('```')) {
        const fenceLang = lines[j].slice(3).split(':')[0].split(' ')[0].trim();
        const { contentLines, endIndex } = extractCodeBlock(lines, j);
        if (contentLines.length > 0 && !seen.has(filename)) {
          seen.add(filename);
          files.push({
            filename,
            language: fenceLang || langFromExt(filename),
            content: contentLines.join('\n'),
          });
        }
        i = endIndex;
        continue;
      }
    }

    // Pattern 5: Plain code block with filename in first comment line
    if (line.startsWith('```') && line.length > 3) {
      const fenceLang = line.slice(3).split(':')[0].split(' ')[0].trim();
      if (fenceLang && !/[./]/.test(fenceLang)) {
        const nextLine = i + 1 < lines.length ? lines[i + 1] : '';
        const commentFileMatch = nextLine.match(/^(?:\/\/|#|--|\/\*)\s*(.+\.\w+)\s*\*?\/?$/)
          ?? nextLine.match(/^(?:\/\/|#|--|\/\*)\s*(?:File|Path):\s*(.+\.\w+)/i);
        if (commentFileMatch && looksLikeFilePath(commentFileMatch[1])) {
          const filename = cleanFilename(commentFileMatch[1]);
          const { contentLines, endIndex } = extractCodeBlock(lines, i);
          if (contentLines.length > 0 && !seen.has(filename)) {
            seen.add(filename);
            files.push({
              filename,
              language: fenceLang || langFromExt(filename),
              content: contentLines.join('\n'),
            });
          }
          i = endIndex;
          continue;
        }
      }
    }

    i++;
  }

  return files;
}
