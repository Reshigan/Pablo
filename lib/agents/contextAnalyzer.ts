// lib/agents/contextAnalyzer.ts
// Analyzes codebase structure, discovers relevant files, maps dependencies
// Devin pattern: always understand the codebase before making changes

export interface FileInfo {
  path: string;
  language: string;
  size: number;
  imports: string[];
  exports: string[];
  isEntry: boolean;
  isConfig: boolean;
  isTest: boolean;
}

export interface DependencyEdge {
  from: string; // importing file
  to: string;   // imported file
  type: 'import' | 'require' | 'dynamic';
}

export interface CodebaseAnalysis {
  files: FileInfo[];
  dependencies: DependencyEdge[];
  entryPoints: string[];
  configFiles: string[];
  testFiles: string[];
  frameworks: string[];
  languages: Record<string, number>;
  totalFiles: number;
  totalLines: number;
}

export interface RelevanceResult {
  path: string;
  score: number; // 0-1
  reason: string;
}

// ─── File Classification ─────────────────────────────────────────────

const ENTRY_PATTERNS = [
  /^(main|index|app|server)\.(ts|js|tsx|jsx|py|go|rs)$/,
  /^src\/(main|index|app)\.(ts|js|tsx|jsx)$/,
  /manage\.py$/,
  /Cargo\.toml$/,
  /go\.mod$/,
];

const CONFIG_PATTERNS = [
  /^(tsconfig|jest\.config|vite\.config|next\.config|tailwind\.config|postcss\.config)\./,
  /^(package|composer|Cargo|Pipfile|pyproject)\.(?:json|toml|lock)$/,
  /^\.(eslintrc|prettierrc|babelrc|editorconfig)/,
  /^(wrangler|vercel|netlify)\./,
  /^\.env/,
  /^Dockerfile/,
  /^docker-compose/,
  /^Makefile$/,
];

const TEST_PATTERNS = [
  /\.(?:test|spec|e2e)\.(ts|js|tsx|jsx|py)$/,
  /^tests?\//,
  /^__tests__\//,
  /test_\w+\.py$/,
];

/**
 * Classify a file based on its path
 */
export function classifyFile(path: string): { isEntry: boolean; isConfig: boolean; isTest: boolean } {
  const basename = path.split('/').pop() || path;
  return {
    isEntry: ENTRY_PATTERNS.some((p) => p.test(path) || p.test(basename)),
    isConfig: CONFIG_PATTERNS.some((p) => p.test(path) || p.test(basename)),
    isTest: TEST_PATTERNS.some((p) => p.test(path) || p.test(basename)),
  };
}

/**
 * Detect language from file extension
 */
export function detectLanguage(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const map: Record<string, string> = {
    ts: 'typescript', tsx: 'typescript', js: 'javascript', jsx: 'javascript',
    py: 'python', rs: 'rust', go: 'go', java: 'java', rb: 'ruby', php: 'php',
    html: 'html', css: 'css', scss: 'scss', json: 'json', yaml: 'yaml', yml: 'yaml',
    md: 'markdown', sql: 'sql', sh: 'shell', toml: 'toml', prisma: 'prisma',
    svelte: 'svelte', vue: 'vue', graphql: 'graphql', xml: 'xml',
  };
  return map[ext] || 'unknown';
}

// ─── Import Extraction ───────────────────────────────────────────────

/**
 * Extract imports from file content
 */
export function extractImports(content: string, language: string): string[] {
  const imports: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    // ES imports: import X from 'Y'
    const esImportRe = /import\s+(?:[\s\S]*?)\s+from\s+['"]([^'"]+)['"]/g;
    let match: RegExpExecArray | null;
    while ((match = esImportRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
    // Dynamic import: import('X')
    const dynImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = dynImportRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
    // require: require('X')
    const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
    while ((match = requireRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
  } else if (language === 'python') {
    // from X import Y
    const fromImportRe = /from\s+([\w.]+)\s+import/g;
    let match: RegExpExecArray | null;
    while ((match = fromImportRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
    // import X
    const importRe = /^import\s+([\w.]+)/gm;
    while ((match = importRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
  } else if (language === 'go') {
    const goImportRe = /import\s+(?:\(\s*([\s\S]*?)\s*\)|"([^"]+)")/g;
    let match: RegExpExecArray | null;
    while ((match = goImportRe.exec(content)) !== null) {
      if (match[1]) {
        // Multi-line import block
        const lines = match[1].split('\n');
        for (const line of lines) {
          const quoted = line.match(/"([^"]+)"/);
          if (quoted) imports.push(quoted[1]);
        }
      } else if (match[2]) {
        imports.push(match[2]);
      }
    }
  } else if (language === 'rust') {
    const useRe = /use\s+([\w:]+)/g;
    let match: RegExpExecArray | null;
    while ((match = useRe.exec(content)) !== null) {
      imports.push(match[1]);
    }
  }

  return imports;
}

/**
 * Extract exports from file content
 */
export function extractExports(content: string, language: string): string[] {
  const exports: string[] = [];

  if (language === 'typescript' || language === 'javascript') {
    // Named exports
    const namedExportRe = /export\s+(?:const|let|var|function|class|interface|type|enum)\s+(\w+)/g;
    let match: RegExpExecArray | null;
    while ((match = namedExportRe.exec(content)) !== null) {
      exports.push(match[1]);
    }
    // Default export
    if (/export\s+default/.test(content)) {
      exports.push('default');
    }
  } else if (language === 'python') {
    // Classes and functions at module level
    const defRe = /^(?:class|def)\s+(\w+)/gm;
    let match: RegExpExecArray | null;
    while ((match = defRe.exec(content)) !== null) {
      exports.push(match[1]);
    }
    // __all__ list
    const allMatch = content.match(/__all__\s*=\s*\[([\s\S]*?)\]/);
    if (allMatch) {
      const names = allMatch[1].match(/['"](\w+)['"]/g);
      if (names) {
        for (const n of names) exports.push(n.replace(/['"]/g, ''));
      }
    }
  }

  return exports;
}

// ─── Codebase Analysis ───────────────────────────────────────────────

/**
 * Analyze a codebase from file paths and contents
 */
export function analyzeCodebase(
  files: Array<{ path: string; content: string }>,
): CodebaseAnalysis {
  const fileInfos: FileInfo[] = [];
  const dependencies: DependencyEdge[] = [];
  const languages: Record<string, number> = {};
  let totalLines = 0;

  for (const file of files) {
    const lang = detectLanguage(file.path);
    const classification = classifyFile(file.path);
    const imports = extractImports(file.content, lang);
    const exports = extractExports(file.content, lang);
    const lines = file.content.split('\n').length;
    totalLines += lines;

    languages[lang] = (languages[lang] || 0) + 1;

    fileInfos.push({
      path: file.path,
      language: lang,
      size: file.content.length,
      imports,
      exports,
      ...classification,
    });

    // Build dependency edges
    for (const imp of imports) {
      // Resolve relative imports to actual file paths
      if (imp.startsWith('.') || imp.startsWith('@/') || imp.startsWith('~/')) {
        dependencies.push({
          from: file.path,
          to: imp,
          type: 'import',
        });
      }
    }
  }

  // Detect frameworks
  const frameworks: string[] = [];
  const allContent = files.map((f) => f.content).join('\n');
  if (allContent.includes('next/') || allContent.includes('next.config')) frameworks.push('next.js');
  if (allContent.includes('react')) frameworks.push('react');
  if (allContent.includes('FastAPI')) frameworks.push('fastapi');
  if (allContent.includes('express')) frameworks.push('express');
  if (allContent.includes('vue')) frameworks.push('vue');
  if (allContent.includes('svelte')) frameworks.push('svelte');
  if (allContent.includes('django')) frameworks.push('django');
  if (allContent.includes('flask')) frameworks.push('flask');

  return {
    files: fileInfos,
    dependencies,
    entryPoints: fileInfos.filter((f) => f.isEntry).map((f) => f.path),
    configFiles: fileInfos.filter((f) => f.isConfig).map((f) => f.path),
    testFiles: fileInfos.filter((f) => f.isTest).map((f) => f.path),
    frameworks: [...new Set(frameworks)],
    languages,
    totalFiles: fileInfos.length,
    totalLines,
  };
}

// ─── Relevance Scoring ───────────────────────────────────────────────

/**
 * Score files by relevance to a query/task
 */
export function scoreRelevance(
  query: string,
  files: Array<{ path: string; content: string }>,
  maxResults: number = 10,
): RelevanceResult[] {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);
  const results: RelevanceResult[] = [];

  for (const file of files) {
    let score = 0;
    const reasons: string[] = [];
    const pathLower = file.path.toLowerCase();
    const contentLower = file.content.toLowerCase();

    // Path match
    for (const term of queryTerms) {
      if (pathLower.includes(term)) {
        score += 0.3;
        reasons.push(`Path contains "${term}"`);
      }
    }

    // Content match
    for (const term of queryTerms) {
      const occurrences = (contentLower.match(new RegExp(term, 'g')) || []).length;
      if (occurrences > 0) {
        score += Math.min(0.1 * occurrences, 0.4);
        reasons.push(`Content has ${occurrences}x "${term}"`);
      }
    }

    // Boost entry points and config files
    const classification = classifyFile(file.path);
    if (classification.isEntry) {
      score += 0.1;
      reasons.push('Entry point');
    }
    if (classification.isConfig && /config|setup|install/.test(queryLower)) {
      score += 0.2;
      reasons.push('Config file');
    }

    // Normalize to 0-1
    score = Math.min(score, 1);

    if (score > 0) {
      results.push({
        path: file.path,
        score,
        reason: reasons.join(', '),
      });
    }
  }

  return results.sort((a, b) => b.score - a.score).slice(0, maxResults);
}

/**
 * Find files that import/depend on a given file
 */
export function findDependents(targetPath: string, analysis: CodebaseAnalysis): string[] {
  return analysis.dependencies
    .filter((d) => d.to.includes(targetPath.replace(/\.(ts|js|tsx|jsx)$/, '')))
    .map((d) => d.from);
}

/**
 * Find files that a given file imports/depends on
 */
export function findDependencies(filePath: string, analysis: CodebaseAnalysis): string[] {
  return analysis.dependencies.filter((d) => d.from === filePath).map((d) => d.to);
}

/**
 * Build a summary of the project structure for LLM context
 */
export function buildProjectSummary(analysis: CodebaseAnalysis): string {
  const parts: string[] = [];

  parts.push(`## Project Structure`);
  parts.push(`- ${analysis.totalFiles} files, ${analysis.totalLines} total lines`);
  parts.push(`- Languages: ${Object.entries(analysis.languages).sort((a, b) => b[1] - a[1]).map(([l, c]) => `${l} (${c})`).join(', ')}`);

  if (analysis.frameworks.length > 0) {
    parts.push(`- Frameworks: ${analysis.frameworks.join(', ')}`);
  }

  if (analysis.entryPoints.length > 0) {
    parts.push(`- Entry points: ${analysis.entryPoints.join(', ')}`);
  }

  if (analysis.configFiles.length > 0) {
    parts.push(`- Config: ${analysis.configFiles.join(', ')}`);
  }

  return parts.join('\n');
}
