/**
 * POST /api/index — Index a repository's codebase
 * GET  /api/index?repo=owner/name&branch=main — Get cached index
 *
 * Loads all files via GitHub Trees API, runs codebase indexer,
 * stores graph in D1, returns summary.
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { indexCodebase } from '@/lib/indexer/codebaseIndexer';
import { d1SaveCodebaseIndex, d1GetCodebaseIndex } from '@/lib/db/d1-codebase';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const repo = request.nextUrl.searchParams.get('repo');
    const branch = request.nextUrl.searchParams.get('branch') || 'main';

    if (!repo) {
      return Response.json({ error: 'repo parameter required' }, { status: 400 });
    }

    const graph = await d1GetCodebaseIndex(repo, branch);
    if (!graph) {
      return Response.json({ error: 'Not indexed yet' }, { status: 404 });
    }

    return Response.json({
      repoFullName: graph.repoFullName,
      branch: graph.branch,
      totalFiles: graph.totalFiles,
      totalSize: graph.totalSize,
      indexedAt: graph.indexedAt,
      fileTypes: Object.entries(
        graph.files.reduce((acc, f) => {
          acc[f.type] = (acc[f.type] || 0) + 1;
          return acc;
        }, {} as Record<string, number>)
      ),
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const body = await request.json() as {
      repo: string;
      branch?: string;
      files?: Array<{ path: string; content: string }>;
    };

    if (!body.repo) {
      return Response.json({ error: 'repo is required' }, { status: 400 });
    }

    const branch = body.branch || 'main';
    let files = body.files || [];

    // If no files provided, fetch from GitHub Trees API
    if (files.length === 0) {
      const token = (session as { accessToken?: string }).accessToken;
      if (!token) {
        return Response.json({ error: 'No GitHub access token' }, { status: 401 });
      }

      const treeResponse = await fetch(
        `https://api.github.com/repos/${body.repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'User-Agent': 'Pablo-IDE/2.0',
          },
        },
      );

      if (!treeResponse.ok) {
        return Response.json({ error: `GitHub API error: ${treeResponse.status}` }, { status: 502 });
      }

      const treeData = await treeResponse.json() as {
        tree: Array<{ path: string; type: string; size?: number }>;
      };

      // Only index code files (< 100KB)
      const codeFiles = treeData.tree.filter(
        f => f.type === 'blob' && f.path.match(/\.(ts|tsx|js|jsx|py|rb|go|rs|css|scss)$/) && (f.size || 0) < 100_000
      );

      // Batch-fetch file contents (limit to 100 files for speed)
      const filesToFetch = codeFiles.slice(0, 100);
      const filePromises = filesToFetch.map(async (f) => {
        const resp = await fetch(
          `https://api.github.com/repos/${body.repo}/contents/${f.path.split('/').map(encodeURIComponent).join('/')}?ref=${encodeURIComponent(branch)}`,
          {
            headers: {
              Authorization: `Bearer ${token}`,
              Accept: 'application/vnd.github.v3.raw',
              'User-Agent': 'Pablo-IDE/2.0',
            },
          },
        );
        if (!resp.ok) return null;
        const content = await resp.text();
        return { path: f.path, content };
      });

      const results = await Promise.allSettled(filePromises);
      files = results
        .filter((r): r is PromiseFulfilledResult<{ path: string; content: string } | null> => r.status === 'fulfilled')
        .map(r => r.value)
        .filter((f): f is { path: string; content: string } => f !== null);
    }

    // Index
    const graph = indexCodebase(body.repo, branch, files);

    // Save to D1
    await d1SaveCodebaseIndex(graph);

    return Response.json({
      repoFullName: graph.repoFullName,
      branch: graph.branch,
      totalFiles: graph.totalFiles,
      totalSize: graph.totalSize,
      indexedAt: graph.indexedAt,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal server error' },
      { status: 500 },
    );
  }
}
