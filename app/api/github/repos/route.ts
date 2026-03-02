import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  language: string | null;
  default_branch: string;
  updated_at: string;
  stargazers_count: number;
  fork: boolean;
}

/**
 * GET /api/github/repos - List authenticated user's repositories
 */
export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const page = searchParams.get('page') || '1';
  const perPage = searchParams.get('per_page') || '30';
  const sort = searchParams.get('sort') || 'updated';

  try {
    const url = new URL('https://api.github.com/user/repos');
    url.searchParams.set('page', page);
    url.searchParams.set('per_page', perPage);
    url.searchParams.set('sort', sort);
    url.searchParams.set('affiliation', 'owner,collaborator,organization_member');
    const response = await fetch(url.toString(),
      {
        headers: {
          Authorization: `Bearer ${session.accessToken}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'Pablo-IDE/2.0',
        },
      }
    );

    if (!response.ok) {
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status }
      );
    }

    const repos = (await response.json()) as GitHubRepo[];
    return NextResponse.json(repos);
  } catch {
    return NextResponse.json(
      { error: 'Failed to fetch repositories' },
      { status: 500 }
    );
  }
}
