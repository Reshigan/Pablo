/**
 * D1 CRUD for Playbooks
 *
 * Stores custom playbooks in D1 database.
 */

import type { Playbook } from '@/lib/agents/playbooks';

async function getDBAsync(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    return (ctx.env as Record<string, unknown>).DB as D1Database || null;
  } catch {
    return null;
  }
}

export async function d1SavePlaybook(playbook: Playbook, createdBy?: string): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  await db.prepare(
    `INSERT OR REPLACE INTO playbooks (id, title, description, trigger_pattern, steps_json, created_by, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`
  ).bind(
    playbook.id,
    playbook.title,
    playbook.description,
    playbook.triggerPattern,
    JSON.stringify(playbook.steps),
    createdBy || null,
  ).run();
}

export async function d1GetPlaybooks(): Promise<Playbook[]> {
  const db = await getDBAsync();
  if (!db) return [];

  const rows = await db.prepare('SELECT * FROM playbooks ORDER BY usage_count DESC').all<{
    id: string;
    title: string;
    description: string;
    trigger_pattern: string;
    steps_json: string;
  }>();

  return (rows.results || []).map(row => ({
    id: row.id,
    title: row.title,
    description: row.description || '',
    triggerPattern: row.trigger_pattern || '',
    steps: JSON.parse(row.steps_json),
    variables: [],
  }));
}

export async function d1DeletePlaybook(id: string): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  await db.prepare('DELETE FROM playbooks WHERE id = ?').bind(id).run();
}

export async function d1IncrementPlaybookUsage(id: string): Promise<void> {
  const db = await getDBAsync();
  if (!db) return;

  await db.prepare('UPDATE playbooks SET usage_count = usage_count + 1 WHERE id = ?').bind(id).run();
}
