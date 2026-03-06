/**
 * Phase 5: Projects API — CRUD for project context system
 * GET    /api/projects              — list projects for current user
 * POST   /api/projects              — create a new project
 * PATCH  /api/projects?id=xxx       — update project
 * DELETE /api/projects?id=xxx       — delete project
 * POST   /api/projects?action=link  — link session to project
 * POST   /api/projects?action=unlink — unlink session from project
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  d1ListProjects,
  d1CreateProject,
  d1UpdateProject,
  d1DeleteProject,
  d1LinkSession,
  d1UnlinkSession,
  d1GetProjectSessions,
} from '@/lib/db/d1-projects';

export const runtime = 'edge';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const userId = session.user?.email || 'anonymous';
    const projectId = request.nextUrl.searchParams.get('id');

    if (projectId) {
      const sessions = await d1GetProjectSessions(projectId, userId);
      return Response.json({ sessions });
    }

    const projects = await d1ListProjects(userId);
    return Response.json({ projects });
  } catch (err) {
    console.error('[projects/GET]', err);
    return Response.json({ error: 'Failed to list projects' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const userId = session.user?.email || 'anonymous';
    const action = request.nextUrl.searchParams.get('action');
    const body = (await request.json()) as Record<string, string>;

    if (action === 'link') {
      const ok = await d1LinkSession(body.projectId, body.sessionId);
      return Response.json({ ok });
    }

    if (action === 'unlink') {
      const ok = await d1UnlinkSession(body.projectId, body.sessionId);
      return Response.json({ ok });
    }

    // Create project
    const project = await d1CreateProject(
      userId,
      body.name || 'Untitled Project',
      body.description || '',
      body.repoFullName || null,
    );

    if (!project) {
      return Response.json({ error: 'Failed to create project' }, { status: 500 });
    }

    return Response.json({ project });
  } catch (err) {
    console.error('[projects/POST]', err);
    return Response.json({ error: 'Failed to create project' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing project id' }, { status: 400 });

    const body = (await request.json()) as Record<string, string>;
    const ok = await d1UpdateProject(id, userId, {
      name: body.name,
      description: body.description,
      repoFullName: body.repoFullName,
    });

    return Response.json({ ok });
  } catch (err) {
    console.error('[projects/PATCH]', err);
    return Response.json({ error: 'Failed to update project' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) return Response.json({ error: 'Missing project id' }, { status: 400 });

    const ok = await d1DeleteProject(id, userId);
    return Response.json({ ok });
  } catch (err) {
    console.error('[projects/DELETE]', err);
    return Response.json({ error: 'Failed to delete project' }, { status: 500 });
  }
}
