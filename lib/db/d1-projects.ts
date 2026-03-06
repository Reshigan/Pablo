/**
 * Phase 5: Project Context Persistence — D1 CRUD for projects table
 *
 * Projects group sessions together and provide multi-session continuity.
 * Each project has a name, description, and linked sessions.
 */

async function getDBAsync(): Promise<D1Database | null> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    return (ctx.env as Record<string, unknown>).DB as D1Database || null;
  } catch {
    return null;
  }
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description: string;
  repoFullName: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectWithSessions extends Project {
  sessionCount: number;
}

/**
 * Ensure the projects table exists (self-healing migration)
 */
async function ensureProjectsTable(db: D1Database): Promise<void> {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      repo_full_name TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )
  `).run();

  // Link table: session <-> project
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS project_sessions (
      project_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      linked_at TEXT DEFAULT (datetime('now')),
      PRIMARY KEY (project_id, session_id)
    )
  `).run();
}

/**
 * List all projects for a user
 */
export async function d1ListProjects(userId: string): Promise<ProjectWithSessions[]> {
  const db = await getDBAsync();
  if (!db) return [];

  try {
    await ensureProjectsTable(db);

    const rows = await db.prepare(`
      SELECT p.*, COUNT(ps.session_id) as session_count
      FROM projects p
      LEFT JOIN project_sessions ps ON p.id = ps.project_id
      WHERE p.user_id = ?
      GROUP BY p.id
      ORDER BY p.updated_at DESC
    `).bind(userId).all<{
      id: string; user_id: string; name: string; description: string;
      repo_full_name: string | null; created_at: string; updated_at: string;
      session_count: number;
    }>();

    return (rows.results || []).map(r => ({
      id: r.id,
      userId: r.user_id,
      name: r.name,
      description: r.description,
      repoFullName: r.repo_full_name,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      sessionCount: r.session_count,
    }));
  } catch (err) {
    console.warn('[d1ListProjects] Failed:', err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Create a new project
 */
export async function d1CreateProject(
  userId: string,
  name: string,
  description: string = '',
  repoFullName: string | null = null,
): Promise<Project | null> {
  const db = await getDBAsync();
  if (!db) return null;

  try {
    await ensureProjectsTable(db);

    const id = `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    await db.prepare(`
      INSERT INTO projects (id, user_id, name, description, repo_full_name)
      VALUES (?, ?, ?, ?, ?)
    `).bind(id, userId, name, description, repoFullName).run();

    return {
      id,
      userId,
      name,
      description,
      repoFullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  } catch (err) {
    console.warn('[d1CreateProject] Failed:', err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Update a project
 */
export async function d1UpdateProject(
  projectId: string,
  userId: string,
  updates: Partial<Pick<Project, 'name' | 'description' | 'repoFullName'>>,
): Promise<boolean> {
  const db = await getDBAsync();
  if (!db) return false;

  try {
    const sets: string[] = [];
    const values: (string | null)[] = [];

    if (updates.name !== undefined) { sets.push('name = ?'); values.push(updates.name); }
    if (updates.description !== undefined) { sets.push('description = ?'); values.push(updates.description); }
    if (updates.repoFullName !== undefined) { sets.push('repo_full_name = ?'); values.push(updates.repoFullName); }

    if (sets.length === 0) return true;

    sets.push("updated_at = datetime('now')");
    values.push(projectId, userId);

    await db.prepare(`UPDATE projects SET ${sets.join(', ')} WHERE id = ? AND user_id = ?`).bind(...values).run();
    return true;
  } catch (err) {
    console.warn('[d1UpdateProject] Failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Delete a project
 */
export async function d1DeleteProject(projectId: string, userId: string): Promise<boolean> {
  const db = await getDBAsync();
  if (!db) return false;

  try {
    // Verify ownership before deleting
    const project = await db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(projectId, userId).first();
    if (!project) return false;

    await db.batch([
      db.prepare('DELETE FROM project_sessions WHERE project_id = ?').bind(projectId),
      db.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?').bind(projectId, userId),
    ]);
    return true;
  } catch (err) {
    console.warn('[d1DeleteProject] Failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Link a session to a project
 */
export async function d1LinkSession(projectId: string, sessionId: string): Promise<boolean> {
  const db = await getDBAsync();
  if (!db) return false;

  try {
    await ensureProjectsTable(db);
    await db.prepare(`
      INSERT OR IGNORE INTO project_sessions (project_id, session_id) VALUES (?, ?)
    `).bind(projectId, sessionId).run();
    return true;
  } catch (err) {
    console.warn('[d1LinkSession] Failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Unlink a session from a project
 */
export async function d1UnlinkSession(projectId: string, sessionId: string): Promise<boolean> {
  const db = await getDBAsync();
  if (!db) return false;

  try {
    await db.prepare(`
      DELETE FROM project_sessions WHERE project_id = ? AND session_id = ?
    `).bind(projectId, sessionId).run();
    return true;
  } catch (err) {
    console.warn('[d1UnlinkSession] Failed:', err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * Get sessions linked to a project
 */
export async function d1GetProjectSessions(projectId: string, userId: string): Promise<string[]> {
  const db = await getDBAsync();
  if (!db) return [];

  try {
    // Verify ownership before returning sessions
    const project = await db.prepare('SELECT id FROM projects WHERE id = ? AND user_id = ?').bind(projectId, userId).first();
    if (!project) return [];

    const rows = await db.prepare(`
      SELECT session_id FROM project_sessions WHERE project_id = ? ORDER BY linked_at DESC
    `).bind(projectId).all<{ session_id: string }>();
    return (rows.results || []).map(r => r.session_id);
  } catch (err) {
    console.warn('[d1GetProjectSessions] Failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
