import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

/**
 * GET /api/github/commits - List recent commits for a repository
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const repo = searchParams.get('repo');
  const sha = searchParams.get('sha') || 'main';
  const perPage = searchParams.get('per_page') || '20';

  if (!repo) {
    return NextResponse.json({ error: 'Missing "repo" parameter' }, { status: 400 });
  }

  try {
    const url = new URL(`https://api.github.com/repos/${repo}/commits`);
    url.searchParams.set('sha', sha);
    url.searchParams.set('per_page', perPage);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'Pablo-IDE/2.0',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const commits = await response.json();
    return NextResponse.json(commits);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch commits' },
      { status: 500 }
    );
  }
}
