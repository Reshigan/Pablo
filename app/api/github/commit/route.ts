/**
 * GitHub Commit API — commit files to a repository via GitHub API
 * 
 * POST /api/github/commit
 * Body: { repo, branch, message, files: [{ path, content }] }
 * 
 * Uses the GitHub Git Data API to create commits without cloning:
 * 1. Get current branch ref → commit SHA → tree SHA
 * 2. Create blobs for each file
 * 3. Create a new tree with the blobs
 * 4. Create a new commit pointing to the tree
 * 5. Update the branch ref to point to the new commit
 */
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';

interface CommitFile {
  path: string;
  content: string;
}

interface CommitRequestBody {
  repo: string;      // "owner/repo"
  branch: string;    // "main"
  message: string;   // commit message
  files: CommitFile[];
}

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

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const accessToken = (session as unknown as { accessToken?: string }).accessToken;
  if (!accessToken) {
    return Response.json({ error: 'No GitHub access token' }, { status: 401 });
  }

  const body = (await request.json()) as CommitRequestBody;
  const { repo, branch, message, files } = body;

  if (!repo || !branch || !message || !files?.length) {
    return Response.json({ error: 'Missing required fields: repo, branch, message, files' }, { status: 400 });
  }

  try {
    const baseUrl = `https://api.github.com/repos/${repo}`;

    // 1. Get current branch ref
    const refRes = await githubAPI(`${baseUrl}/git/refs/heads/${branch}`, accessToken);
    if (!refRes.ok) {
      const errText = await refRes.text();
      return Response.json({ error: `Failed to get branch ref: ${errText}` }, { status: refRes.status });
    }
    const refData = (await refRes.json()) as { object: { sha: string } };
    const latestCommitSha = refData.object.sha;

    // 2. Get the commit to find its tree
    const commitRes = await githubAPI(`${baseUrl}/git/commits/${latestCommitSha}`, accessToken);
    if (!commitRes.ok) throw new Error('Failed to get commit');
    const commitData = (await commitRes.json()) as { tree: { sha: string } };
    const baseTreeSha = commitData.tree.sha;

    // 3. Create blobs for each file
    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const file of files) {
      const blobRes = await githubAPI(`${baseUrl}/git/blobs`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          content: file.content,
          encoding: 'utf-8',
        }),
      });
      if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`);
      const blobData = (await blobRes.json()) as { sha: string };
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blobData.sha,
      });
    }

    // 4. Create a new tree
    const treeRes = await githubAPI(`${baseUrl}/git/trees`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems,
      }),
    });
    if (!treeRes.ok) throw new Error('Failed to create tree');
    const treeData = (await treeRes.json()) as { sha: string };

    // 5. Create a new commit
    const newCommitRes = await githubAPI(`${baseUrl}/git/commits`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        message,
        tree: treeData.sha,
        parents: [latestCommitSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error('Failed to create commit');
    const newCommitData = (await newCommitRes.json()) as { sha: string; html_url: string };

    // 6. Update the branch ref to point to the new commit
    const updateRefRes = await githubAPI(`${baseUrl}/git/refs/heads/${branch}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({
        sha: newCommitData.sha,
      }),
    });
    if (!updateRefRes.ok) throw new Error('Failed to update branch ref');

    return Response.json({
      success: true,
      sha: newCommitData.sha,
      message,
      filesCommitted: files.length,
      branch,
      url: `https://github.com/${repo}/commit/${newCommitData.sha}`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
