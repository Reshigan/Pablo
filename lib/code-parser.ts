/**
 * Code Parser — Extracts files from AI-generated markdown responses
 *
 * Parses two patterns:
 * 1. ### filename.ext  followed by a ```lang code block
 * 2. ```lang:filename.ext  (colon-separated language:filename)
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
  };
  return map[ext] ?? 'plaintext';
}

/**
 * Parse generated markdown content and extract files
 */
export function parseGeneratedFiles(markdown: string): ParsedFile[] {
  const files: ParsedFile[] = [];
  const lines = markdown.split('\n');

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // Pattern 1: ### filename.ext  (header followed by code block)
    const headerMatch = line.match(/^#{1,3}\s+(.+\.\w+)\s*$/);
    if (headerMatch) {
      const filename = headerMatch[1].trim();
      // Look for the next code block
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        j++;
      }
      if (j < lines.length && lines[j].startsWith('```')) {
        const fenceLang = lines[j].slice(3).split(':')[0].trim();
        const contentLines: string[] = [];
        j++;
        while (j < lines.length && !lines[j].startsWith('```')) {
          contentLines.push(lines[j]);
          j++;
        }
        files.push({
          filename,
          language: fenceLang || langFromExt(filename),
          content: contentLines.join('\n'),
        });
        i = j + 1;
        continue;
      }
    }

    // Pattern 2: ```lang:filename.ext  (inline filename in fence)
    const fenceMatch = line.match(/^```(\w+):(.+\.\w+)\s*$/);
    if (fenceMatch) {
      const language = fenceMatch[1];
      const filename = fenceMatch[2].trim();
      const contentLines: string[] = [];
      let j = i + 1;
      while (j < lines.length && !lines[j].startsWith('```')) {
        contentLines.push(lines[j]);
        j++;
      }
      files.push({
        filename,
        language,
        content: contentLines.join('\n'),
      });
      i = j + 1;
      continue;
    }

    i++;
  }

  return files;
}
