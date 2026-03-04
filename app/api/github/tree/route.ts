import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * GET /api/github/tree - Get full repository tree in a single API call
 * Query params: repo (owner/name), branch (branch name), recursive (true/false)
 * Uses GitHub Git Trees API for fast, complete repo tree loading
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const repo = searchParams.get('repo');
  const branch = searchParams.get('branch') || 'main';
  const recursive = searchParams.get('recursive') !== 'false';

  if (!repo) {
    return NextResponse.json({ error: 'repo parameter required' }, { status: 400 });
  }

  try {
    const url = `https://api.github.com/repos/${repo}/git/trees/${encodeURIComponent(branch)}${recursive ? '?recursive=1' : ''}`;
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Pablo-IDE/2.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status },
      );
    }

    const tree = await response.json();
    return NextResponse.json(tree);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch repository tree' },
      { status: 500 },
    );
  }
}
