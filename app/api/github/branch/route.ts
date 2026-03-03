/**
 * GitHub Branch API — create and list branches
 *
 * POST /api/github/branch — Create a new branch from a ref
 * Body: { repo, branch, from_branch? }
 *
 * GET /api/github/branch?repo=owner/repo — List branches
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
    branch: string;
    from_branch?: string;
  };

  const { repo, branch } = body;
  if (!repo || !branch) {
    return Response.json({ error: 'Missing required fields: repo, branch' }, { status: 400 });
  }

  try {
    const baseUrl = `https://api.github.com/repos/${repo}`;

    // Get the SHA of the source branch (default: main branch)
    const fromBranch = body.from_branch ?? 'main';
    const refRes = await githubAPI(`${baseUrl}/git/refs/heads/${fromBranch}`, accessToken);
    if (!refRes.ok) {
      // Try 'master' if 'main' fails
      if (fromBranch === 'main') {
        const masterRes = await githubAPI(`${baseUrl}/git/refs/heads/master`, accessToken);
        if (!masterRes.ok) {
          return Response.json({ error: `Source branch not found: ${fromBranch}` }, { status: 404 });
        }
        const masterData = (await masterRes.json()) as { object: { sha: string } };
        const sha = masterData.object.sha;
        const createRes = await githubAPI(`${baseUrl}/git/refs`, accessToken, {
          method: 'POST',
          body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
        });
        if (!createRes.ok) {
          const err = (await createRes.json()) as { message?: string };
          return Response.json({ error: err.message ?? 'Failed to create branch' }, { status: createRes.status });
        }
        return Response.json({ success: true, branch, sha, from: 'master' });
      }
      return Response.json({ error: `Source branch not found: ${fromBranch}` }, { status: 404 });
    }

    const refData = (await refRes.json()) as { object: { sha: string } };
    const sha = refData.object.sha;

    // Create the new branch
    const createRes = await githubAPI(`${baseUrl}/git/refs`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ ref: `refs/heads/${branch}`, sha }),
    });

    if (!createRes.ok) {
      const err = (await createRes.json()) as { message?: string };
      return Response.json({ error: err.message ?? 'Failed to create branch' }, { status: createRes.status });
    }

    return Response.json({ success: true, branch, sha, from: fromBranch });
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
      `https://api.github.com/repos/${repo}/branches?per_page=30`,
      accessToken,
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const branches = await res.json();
    return Response.json(branches);
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
