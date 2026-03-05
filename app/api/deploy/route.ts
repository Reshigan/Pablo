/**
 * Deploy API — Deploy generated code to Cloudflare Pages or preview
 *
 * POST /api/deploy
 * Body: { files: [{ path, content }], project_name?, production? }
 *
 * This creates a deployment by:
 * 1. Creating a new GitHub repo (or using existing) for the project
 * 2. Committing the files
 * 3. Returning the deployment URL
 *
 * For quick preview: uses data URI / blob approach
 */
import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { checkRateLimit, getClientIP, rateLimitHeaders, RATE_LIMITS } from '@/lib/rateLimit';
import { loggers } from '@/lib/logger';
import { checkBodySize, BODY_SIZE_LIMITS } from '@/lib/apiGuard';

interface DeployFile {
  path: string;
  content: string;
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

function getAccessToken(session: unknown): string | null {
  return (session as { accessToken?: string }).accessToken ?? null;
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  // ARCH-05: Body size guard
  const sizeErr = checkBodySize(request.headers, BODY_SIZE_LIMITS.deploy);
  if (sizeErr) return sizeErr;

  // ARCH-01: Rate limiting — deploy is expensive, limit to 5/min
  const clientIP = getClientIP(request.headers);
  const rl = checkRateLimit(`deploy:${clientIP}`, RATE_LIMITS.deploy);
  if (!rl.allowed) {
    loggers.deploy.warn('Rate limit exceeded', { ip: clientIP });
    return Response.json(
      { error: 'Rate limit exceeded. Please wait before deploying again.' },
      { status: 429, headers: rateLimitHeaders(rl) },
    );
  }

  const accessToken = getAccessToken(session);
  if (!accessToken) return Response.json({ error: 'No GitHub access token' }, { status: 401 });

  const body = (await request.json()) as {
    files: DeployFile[];
    project_name?: string;
    repo?: string;
    branch?: string;
    description?: string;
  };

  const { files } = body;
  if (!files?.length) {
    return Response.json({ error: 'No files to deploy' }, { status: 400 });
  }

  const projectName = body.project_name ?? `pablo-deploy-${Date.now()}`;

  try {
    // If a repo is specified, commit files to it
    if (body.repo) {
      const branch = body.branch ?? 'main';
      const baseUrl = `https://api.github.com/repos/${body.repo}`;

      // Get current branch ref
      const refRes = await githubAPI(`${baseUrl}/git/refs/heads/${branch}`, accessToken);
      if (!refRes.ok) throw new Error(`Branch ${branch} not found`);
      const refData = (await refRes.json()) as { object: { sha: string } };
      const latestSha = refData.object.sha;

      // Get tree
      const commitRes = await githubAPI(`${baseUrl}/git/commits/${latestSha}`, accessToken);
      if (!commitRes.ok) throw new Error('Failed to get commit');
      const commitData = (await commitRes.json()) as { tree: { sha: string } };

      // Create blobs
      const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
      for (const file of files) {
        const blobRes = await githubAPI(`${baseUrl}/git/blobs`, accessToken, {
          method: 'POST',
          body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
        });
        if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`);
        const blobData = (await blobRes.json()) as { sha: string };
        treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
      }

      // Create tree
      const treeRes = await githubAPI(`${baseUrl}/git/trees`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeItems }),
      });
      if (!treeRes.ok) throw new Error('Failed to create tree');
      const treeData = (await treeRes.json()) as { sha: string };

      // Create commit
      const newCommitRes = await githubAPI(`${baseUrl}/git/commits`, accessToken, {
        method: 'POST',
        body: JSON.stringify({
          message: `Deploy: ${projectName} (${files.length} files)`,
          tree: treeData.sha,
          parents: [latestSha],
        }),
      });
      if (!newCommitRes.ok) throw new Error('Failed to create commit');
      const newCommit = (await newCommitRes.json()) as { sha: string };

      // Update ref
      await githubAPI(`${baseUrl}/git/refs/heads/${branch}`, accessToken, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommit.sha }),
      });

      return Response.json({
        success: true,
        type: 'github',
        repo: body.repo,
        branch,
        sha: newCommit.sha,
        url: `https://github.com/${body.repo}`,
        files_deployed: files.length,
        message: `Deployed ${files.length} files to ${body.repo}/${branch}`,
      });
    }

    // No repo specified — create a new one
    const createRes = await githubAPI('https://api.github.com/user/repos', accessToken, {
      method: 'POST',
      body: JSON.stringify({
        name: projectName,
        description: body.description ?? `Deployed from Pablo IDE`,
        private: true, // SEC-07: default to private repos
        auto_init: true,
      }),
    });

    if (!createRes.ok) {
      const err = (await createRes.json()) as { message?: string };
      throw new Error(err.message ?? 'Failed to create repository');
    }

    const repo = (await createRes.json()) as { full_name: string; html_url: string; default_branch: string };

    // Wait a moment for the repo to initialize
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Now commit all files
    const baseUrl = `https://api.github.com/repos/${repo.full_name}`;
    const branch = repo.default_branch;

    const refRes = await githubAPI(`${baseUrl}/git/refs/heads/${branch}`, accessToken);
    if (!refRes.ok) throw new Error('Failed to get branch ref for new repo');
    const refData = (await refRes.json()) as { object: { sha: string } };
    const latestSha = refData.object.sha;

    const commitRes = await githubAPI(`${baseUrl}/git/commits/${latestSha}`, accessToken);
    if (!commitRes.ok) throw new Error('Failed to get commit');
    const commitData = (await commitRes.json()) as { tree: { sha: string } };

    const treeItems: Array<{ path: string; mode: string; type: string; sha: string }> = [];
    for (const file of files) {
      const blobRes = await githubAPI(`${baseUrl}/git/blobs`, accessToken, {
        method: 'POST',
        body: JSON.stringify({ content: file.content, encoding: 'utf-8' }),
      });
      if (!blobRes.ok) throw new Error(`Failed to create blob for ${file.path}`);
      const blobData = (await blobRes.json()) as { sha: string };
      treeItems.push({ path: file.path, mode: '100644', type: 'blob', sha: blobData.sha });
    }

    const treeRes = await githubAPI(`${baseUrl}/git/trees`, accessToken, {
      method: 'POST',
      body: JSON.stringify({ base_tree: commitData.tree.sha, tree: treeItems }),
    });
    if (!treeRes.ok) throw new Error('Failed to create tree');
    const treeData = (await treeRes.json()) as { sha: string };

    const newCommitRes = await githubAPI(`${baseUrl}/git/commits`, accessToken, {
      method: 'POST',
      body: JSON.stringify({
        message: `Initial deploy from Pablo IDE (${files.length} files)`,
        tree: treeData.sha,
        parents: [latestSha],
      }),
    });
    if (!newCommitRes.ok) throw new Error('Failed to create commit');
    const newCommit = (await newCommitRes.json()) as { sha: string };

    await githubAPI(`${baseUrl}/git/refs/heads/${branch}`, accessToken, {
      method: 'PATCH',
      body: JSON.stringify({ sha: newCommit.sha }),
    });

    return Response.json({
      success: true,
      type: 'new-repo',
      repo: repo.full_name,
      branch,
      sha: newCommit.sha,
      url: repo.html_url,
      files_deployed: files.length,
      message: `Created ${repo.full_name} and deployed ${files.length} files`,
    });
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : 'Unknown error';
    return Response.json({ error: errMsg }, { status: 500 });
  }
}
