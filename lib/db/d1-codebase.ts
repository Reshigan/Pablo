/**
 * D1 CRUD for Codebase Index
 *
 * Stores and retrieves codebase graph data from the D1 database.
 */

import type { CodebaseGraph } from '@/lib/indexer/codebaseIndexer';

function getDB(): D1Database | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getCloudflareContext } = require('@opennextjs/cloudflare');
    const ctx = getCloudflareContext({ async: false });
    return (ctx?.env as Record<string, unknown>)?.DB as D1Database || null;
  } catch {
    return null;
  }
}

async function getDBAsync(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    return (ctx.env as Record<string, unknown>).DB as D1Database || null;
  } catch {
    return null;
  }
}

export async function d1SaveCodebaseIndex(graph: CodebaseGraph): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  const id = `${graph.repoFullName}:${graph.branch}`;
  await db.prepare(
    `INSERT OR REPLACE INTO codebase_index (id, repo_full_name, branch, graph_json, indexed_at, total_files, total_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    id,
    graph.repoFullName,
    graph.branch,
    JSON.stringify(graph),
    graph.indexedAt,
    graph.totalFiles,
    graph.totalSize,
  ).run();
}

export async function d1GetCodebaseIndex(repoFullName: string, branch: string): Promise<CodebaseGraph | null> {
  const db = await getDBAsync();
  if (!db) return null;

  const id = `${repoFullName}:${branch}`;
  const row = await db.prepare(
    'SELECT graph_json FROM codebase_index WHERE id = ?'
  ).bind(id).first<{ graph_json: string }>();

  if (!row) return null;
  return JSON.parse(row.graph_json) as CodebaseGraph;
}

export async function d1DeleteCodebaseIndex(repoFullName: string, branch: string): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  const id = `${repoFullName}:${branch}`;
  await db.prepare('DELETE FROM codebase_index WHERE id = ?').bind(id).run();
}

export { getDB, getDBAsync };
