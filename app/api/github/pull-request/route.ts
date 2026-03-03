/**
 * GitHub Pull Request API — create and list pull requests
 *
 * POST /api/github/pull-request — Create a new PR
 * Body: { repo, title, head, base, body?, draft? }
 *
 * GET /api/github/pull-request?repo=owner/repo — List open PRs
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

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = getAccessToken(session);
  if (!accessToken) return Response.json({ error: 'No GitHub access token' }, { status: 401 });

  const body = (await request.json()) as {
    repo: string;
    title: string;
    head: string;
    base: string;
    body?: string;
    draft?: boolean;
  };

  const { repo, title, head, base } = body;
  if (!repo || !title || !head || !base) {
    return Response.json({ error: 'Missing required fields: repo, title, head, base' }, { status: 400 });
  }

  try {
    const res = await githubAPI(`https://api.github.com/repos/${repo}/pulls`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        title,
        head,
        base,
        body: body.body ?? '',
        draft: body.draft ?? false,
      }),
    });

    if (!res.ok) {
      const errData = (await res.json()) as { message?: string; errors?: Array<{ message: string }> };
      const errMsg = errData.errors?.[0]?.message ?? errData.message ?? `HTTP ${res.status}`;
      return Response.json({ error: errMsg }, { status: res.status });
    }

    const pr = (await res.json()) as { number: number; html_url: string; title: string; state: string };
    return Response.json({
      success: true,
      number: pr.number,
      url: pr.html_url,
      title: pr.title,
      state: pr.state,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const accessToken = getAccessToken(session);
  if (!accessToken) return Response.json({ error: 'No GitHub access token' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const repo = searchParams.get('repo');
  if (!repo) return Response.json({ error: 'Missing repo parameter' }, { status: 400 });

  try {
    const res = await githubAPI(
      `https://api.github.com/repos/${repo}/pulls?state=open&per_page=10&sort=updated&direction=desc`,
      accessToken,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const prs = await res.json();
    return Response.json(prs);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
