import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

interface GitHubContent {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  content?: string;
  encoding?: string;
  html_url: string;
  download_url: string | null;
}

/**
 * GET /api/github/contents - Get file/directory contents from a repository
 * Query params: repo (owner/name), path (file path), ref (branch)
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const repo = searchParams.get('repo');
  const path = searchParams.get('path') || '';
  const ref = searchParams.get('ref') || '';

  if (!repo) {
    return NextResponse.json({ error: 'repo parameter required' }, { status: 400 });
  }

  try {
    const encodedPath = path.split('/').map(encodeURIComponent).join('/');
    const url = new URL(`https://api.github.com/repos/${repo}/contents/${encodedPath}`);
    if (ref) url.searchParams.set('ref', ref);
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const contents = (await response.json()) as GitHubContent | GitHubContent[];
    return NextResponse.json(contents);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch contents' },
      { status: 500 }
    );
  }
}
