/**
 * Pablo v9 — Codebase Indexer
 *
 * Parses JS/TS files to extract:
 *   - Imports (what this file depends on)
 *   - Exports (what this file provides)
 *   - Function/component definitions
 *   - File type classification (component, route, model, util, test, config)
 *
 * Stores in D1 for fast querying by the orchestrator.
 * Uses regex-based parsing (no AST library needed on Workers).
 */

export interface FileNode {
  path: string;
  type: 'component' | 'route' | 'api' | 'model' | 'util' | 'test' | 'config' | 'style' | 'unknown';
  imports: string[];
  exports: string[];
  defaultExport: string | null;
  functions: string[];
  dependencies: string[];
  size: number;
  lastIndexed: string;
}

export interface CodebaseGraph {
  repoFullName: string;
  branch: string;
  files: FileNode[];
  indexedAt: string;
  totalFiles: number;
  totalSize: number;
}

/**
 * Classify a file by its path and content
 */
function classifyFile(path: string, content: string): FileNode['type'] {
  const lower = path.toLowerCase();
  if (lower.includes('.test.') || lower.includes('.spec.') || lower.includes('__tests__')) return 'test';
  if (lower.includes('/api/') || lower.match(/route\.(ts|js)$/)) return 'api';
  if (lower.match(/\.(css|scss|less|styled)/) || lower.includes('styles')) return 'style';
  if (lower.match(/(config|\.config)\.(ts|js|mjs)$/) || lower.includes('wrangler') || lower.includes('tsconfig')) return 'config';
  if (lower.includes('/models/') || lower.includes('/schema') || lower.includes('/entities/')) return 'model';
  if (lower.includes('/components/') || lower.includes('/pages/')) return 'component';
  if (lower.match(/page\.(tsx|jsx)$/)) return 'component';
  if (lower.match(/route\.(ts|js)$/)) return 'route';
  if (lower.includes('/utils/') || lower.includes('/lib/') || lower.includes('/helpers/')) return 'util';

  // Content-based detection
  if (content.match(/export\s+default\s+function\s+\w+[\s\S]*\([\s\S]*\)[\s\S]*\{?\s*return\s+[(<]/)) return 'component';
  if (content.includes('sqliteTable') || content.includes('createTable') || content.includes('Schema')) return 'model';

  return 'unknown';
}

/**
 * Extract imports from a JS/TS file using regex
 */
function extractImports(content: string): string[] {
  const imports: string[] = [];

  const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
  let match;
  while ((match = importRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  const requireRegex = /require\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
  while ((match = requireRegex.exec(content)) !== null) {
    imports.push(match[1]);
  }

  return imports;
}

/**
 * Extract exports from a JS/TS file
 */
function extractExports(content: string): { named: string[]; defaultExport: string | null } {
  const named: string[] = [];
  let defaultExport: string | null = null;

  const namedRegex = /export\s+(?:async\s+)?(?:function|const|let|var|class|type|interface|enum)\s+(\w+)/g;
  let match;
  while ((match = namedRegex.exec(content)) !== null) {
    named.push(match[1]);
  }

  const defaultRegex = /export\s+default\s+(?:async\s+)?(?:function|class)\s+(\w+)/;
  const defaultMatch = content.match(defaultRegex);
  if (defaultMatch) {
    defaultExport = defaultMatch[1];
  }

  return { named, defaultExport };
}

/**
 * Extract function/class definitions
 */
function extractDefinitions(content: string): string[] {
  const defs: string[] = [];

  const funcRegex = /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g;
  const classRegex = /(?:export\s+)?class\s+(\w+)/g;
  const constFuncRegex = /(?:export\s+)?const\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[^=])\s*=>/g;

  let match;
  while ((match = funcRegex.exec(content)) !== null) defs.push(match[1]);
  while ((match = classRegex.exec(content)) !== null) defs.push(match[1]);
  while ((match = constFuncRegex.exec(content)) !== null) defs.push(match[1]);

  return [...new Set(defs)];
}

/**
 * Resolve relative import paths to absolute paths within the project
 */
function resolveImport(importPath: string, currentFile: string, allPaths: Set<string>): string | null {
  if (!importPath.startsWith('.') && !importPath.startsWith('@/')) return null;

  const currentDir = currentFile.split('/').slice(0, -1).join('/');
  let resolved: string;

  if (importPath.startsWith('@/')) {
    resolved = importPath.replace('@/', 'src/');
  } else {
    const parts = currentDir.split('/');
    const importParts = importPath.split('/');
    for (const part of importParts) {
      if (part === '..') parts.pop();
      else if (part !== '.') parts.push(part);
    }
    resolved = parts.join('/');
  }

  const extensions = ['', '.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx', '/index.js'];
  for (const ext of extensions) {
    if (allPaths.has(resolved + ext)) return resolved + ext;
  }

  return null;
}

/**
 * Index an entire codebase from a list of files
 */
export function indexCodebase(
  repoFullName: string,
  branch: string,
  files: Array<{ path: string; content: string }>,
): CodebaseGraph {
  const allPaths = new Set(files.map(f => f.path));

  const nodes: FileNode[] = files
    .filter(f => f.path.match(/\.(ts|tsx|js|jsx|py|rb|go|rs)$/))
    .map(f => {
      const imports = extractImports(f.content);
      const { named, defaultExport } = extractExports(f.content);
      const functions = extractDefinitions(f.content);
      const dependencies = imports
        .map(imp => resolveImport(imp, f.path, allPaths))
        .filter((d): d is string => d !== null);

      return {
        path: f.path,
        type: classifyFile(f.path, f.content),
        imports,
        exports: named,
        defaultExport,
        functions,
        dependencies,
        size: f.content.length,
        lastIndexed: new Date().toISOString(),
      };
    });

  return {
    repoFullName,
    branch,
    files: nodes,
    indexedAt: new Date().toISOString(),
    totalFiles: nodes.length,
    totalSize: nodes.reduce((sum, n) => sum + n.size, 0),
  };
}

/**
 * Find all files related to a given file (imports it, or is imported by it)
 */
export function findRelatedFiles(graph: CodebaseGraph, filePath: string, depth: number = 2): string[] {
  const related = new Set<string>();
  const queue: Array<{ path: string; currentDepth: number }> = [{ path: filePath, currentDepth: 0 }];

  while (queue.length > 0) {
    const item = queue.shift()!;
    if (related.has(item.path) || item.currentDepth > depth) continue;
    related.add(item.path);

    const node = graph.files.find(f => f.path === item.path);
    if (!node) continue;

    for (const dep of node.dependencies) {
      if (!related.has(dep)) {
        queue.push({ path: dep, currentDepth: item.currentDepth + 1 });
      }
    }

    for (const other of graph.files) {
      if (other.dependencies.includes(item.path) && !related.has(other.path)) {
        queue.push({ path: other.path, currentDepth: item.currentDepth + 1 });
      }
    }
  }

  related.delete(filePath);
  return Array.from(related);
}

/**
 * Find the best files to provide as context for a user query
 */
export function findRelevantFiles(
  graph: CodebaseGraph,
  query: string,
  maxFiles: number = 20,
): string[] {
  const lower = query.toLowerCase();
  const scored: Array<{ path: string; score: number }> = [];

  for (const node of graph.files) {
    let score = 0;

    const filename = node.path.split('/').pop()?.toLowerCase() || '';
    if (lower.includes(filename.replace(/\.(ts|tsx|js|jsx)$/, ''))) score += 10;

    for (const fn of node.functions) {
      if (lower.includes(fn.toLowerCase())) score += 5;
    }

    for (const exp of node.exports) {
      if (lower.includes(exp.toLowerCase())) score += 5;
    }

    if (lower.match(/\b(api|endpoint|route)\b/) && node.type === 'api') score += 3;
    if (lower.match(/\b(component|ui|page|form|button)\b/) && node.type === 'component') score += 3;
    if (lower.match(/\b(model|schema|database|table)\b/) && node.type === 'model') score += 3;
    if (lower.match(/\b(test|spec)\b/) && node.type === 'test') score += 3;

    const importedByCount = graph.files.filter(f => f.dependencies.includes(node.path)).length;
    score += Math.min(importedByCount, 5);

    if (score > 0) scored.push({ path: node.path, score });
  }

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, maxFiles)
    .map(s => s.path);
}
