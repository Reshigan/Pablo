/**
 * GitHub File API — create, update, delete, and rename files
 *
 * PUT /api/github/file — Create or update a file
 * Body: { repo, path, content, message, branch?, sha? }
 *
 * DELETE /api/github/file — Delete a file
 * Body: { repo, path, message, branch?, sha }
 */
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

async function githubAPI(url: string, token: string, options: RequestInit = {}): Promise<Response> {
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'Pablo-IDE/2.0',
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });
}

function getAccessToken(session: unknown): string | null {
  return (session as { accessToken?: string }).accessToken ?? null;
}

export async function PUT(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = getAccessToken(session);
  if (!accessToken) return Response.json({ error: 'No GitHub access token' }, { status: 401 });

  const body = (await request.json()) as {
    repo: string;
    path: string;
    content: string;
    message: string;
    branch?: string;
    sha?: string;
  };

  const { repo, path, content, message } = body;
  if (!repo || !path || content === undefined || !message) {
    return Response.json({ error: 'Missing required fields: repo, path, content, message' }, { status: 400 });
  }

  try {
    const payload: Record<string, string> = {
      message,
      content: btoa(unescape(encodeURIComponent(content))),
    };
    if (body.branch) payload.branch = body.branch;
    if (body.sha) payload.sha = body.sha;

    const res = await githubAPI(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      accessToken,
      { method: 'PUT', body: JSON.stringify(payload) },
    );

    if (!res.ok) {
      const errData = (await res.json()) as { message?: string };
      return Response.json({ error: errData.message ?? `HTTP ${res.status}` }, { status: res.status });
    }

    const data = (await res.json()) as { content: { sha: string; html_url: string; path: string } };
    return Response.json({
      success: true,
      sha: data.content.sha,
      path: data.content.path,
      url: data.content.html_url,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = getAccessToken(session);
  if (!accessToken) return Response.json({ error: 'No GitHub access token' }, { status: 401 });

  const body = (await request.json()) as {
    repo: string;
    path: string;
    message: string;
    branch?: string;
    sha: string;
  };

  const { repo, path, message, sha } = body;
  if (!repo || !path || !message || !sha) {
    return Response.json({ error: 'Missing required fields: repo, path, message, sha' }, { status: 400 });
  }

  try {
    const payload: Record<string, string> = { message, sha };
    if (body.branch) payload.branch = body.branch;

    const res = await githubAPI(
      `https://api.github.com/repos/${repo}/contents/${path}`,
      accessToken,
      { method: 'DELETE', body: JSON.stringify(payload) },
    );

    if (!res.ok) {
      const errData = (await res.json()) as { message?: string };
      return Response.json({ error: errData.message ?? `HTTP ${res.status}` }, { status: res.status });
    }

    return Response.json({ success: true, path, deleted: true });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
