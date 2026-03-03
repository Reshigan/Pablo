/**
 * GitHub Create Repo API — create new repositories
 *
 * POST /api/github/create-repo
 * Body: { name, description?, private?, auto_init? }
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
    name: string;
    description?: string;
    private?: boolean;
    auto_init?: boolean;
  };

  const { name } = body;
  if (!name) {
    return Response.json({ error: 'Missing required field: name' }, { status: 400 });
  }

  try {
    const res = await githubAPI('https://api.github.com/user/repos', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        name,
        description: body.description ?? '',
        private: body.private ?? false,
        auto_init: body.auto_init ?? true,
      }),
    });

    if (!res.ok) {
      const errData = (await res.json()) as { message?: string; errors?: Array<{ message: string }> };
      const errMsg = errData.errors?.[0]?.message ?? errData.message ?? `HTTP ${res.status}`;
      return Response.json({ error: errMsg }, { status: res.status });
    }

    const repo = (await res.json()) as {
      full_name: string;
      html_url: string;
      name: string;
      private: boolean;
      default_branch: string;
    };

    return Response.json({
      success: true,
      full_name: repo.full_name,
      url: repo.html_url,
      name: repo.name,
      private: repo.private,
      default_branch: repo.default_branch,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
