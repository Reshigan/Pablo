/**
 * POST /api/github/webhook — GitHub App webhook handler
 *
 * Handles:
 *   - issues.labeled: When an issue is labeled "pablo", start working on it
 *   - issue_comment.created: When someone comments @pablo on an issue
 *   - pull_request.opened: Auto-review PRs (Pablo Review)
 *
 * Flow for issue-to-PR:
 *   1. Parse issue body as task description
 *   2. Create branch: pablo/issue-{number}
 *   3. Run orchestrator with issue body as message
 *   4. Commit generated files to branch
 *   5. Open PR referencing the issue
 *   6. Comment on issue with PR link
 */

import { NextRequest } from 'next/server';
import { reviewPR, type PRReviewResult } from '@/lib/agents/prReview';
import type { EnvConfig } from '@/lib/agents/modelRouter';

async function verifyGitHubSignature(payload: string, signature: string): Promise<boolean> {
  const secret = process.env.GITHUB_WEBHOOK_SECRET;
  if (!secret) return false;
  if (!signature.startsWith('sha256=')) return false;

  // HMAC-SHA256 verification using Web Crypto API (Workers-compatible)
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(payload));
  const expected = 'sha256=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

async function getEnvConfig(): Promise<EnvConfig> {
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const cfEnv = ctx.env as Record<string, string>;
    return {
      OLLAMA_URL: cfEnv.OLLAMA_URL || 'https://ollama.com',
      OLLAMA_API_KEY: cfEnv.OLLAMA_API_KEY || '',
    };
  } catch {
    return {
      OLLAMA_URL: process.env.OLLAMA_URL || 'https://ollama.com',
      OLLAMA_API_KEY: process.env.OLLAMA_API_KEY || '',
    };
  }
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const signature = request.headers.get('x-hub-signature-256') || '';
    const event = request.headers.get('x-github-event');

    // Verify webhook signature
    if (process.env.GITHUB_WEBHOOK_SECRET && !(await verifyGitHubSignature(rawBody, signature))) {
      return new Response('Invalid signature', { status: 401 });
    }

    const body = JSON.parse(rawBody) as {
      action: string;
      label?: { name: string };
      issue?: { number: number; title: string; body?: string };
      comment?: { body: string };
      pull_request?: { number: number; title: string; body?: string; diff_url: string; head?: { sha: string } };
      repository: { full_name: string };
    };

    if (event === 'issues' && body.action === 'labeled') {
      const label = body.label?.name;
      if (label === 'pablo') {
        handleIssue(body.issue!, body.repository).catch(console.error);
        return Response.json({ ok: true, status: 'processing' });
      }
    }

    if (event === 'issue_comment' && body.action === 'created') {
      const comment = body.comment?.body || '';
      if (comment.includes('@pablo')) {
        handleIssueComment(body.issue!, body.comment!, body.repository).catch(console.error);
        return Response.json({ ok: true, status: 'processing' });
      }
    }

    if (event === 'pull_request' && body.action === 'opened') {
      handlePRReview(body.pull_request!, body.repository, body.pull_request!.head?.sha || '').catch(console.error);
      return Response.json({ ok: true, status: 'reviewing' });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[GitHub Webhook] Error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

interface IssueData {
  number: number;
  title: string;
  body?: string;
}

interface CommentData {
  body: string;
}

interface RepoData {
  full_name: string;
}

interface PRData {
  number: number;
  title: string;
  body?: string;
  diff_url: string;
  head?: { sha: string };
}

async function handleIssue(issue: IssueData, repo: RepoData): Promise<void> {
  const repoFullName = repo.full_name;
  const issueNumber = issue.number;
  const issueTitle = issue.title;
  const issueBody = issue.body || '';

  const taskMessage = `${issueTitle}\n\n${issueBody}`;
  console.log(`[GitHub Webhook] Processing issue #${issueNumber} on ${repoFullName}: ${taskMessage.slice(0, 100)}`);

  // TODO: Call orchestrator, create branch, commit, open PR
  // This follows the same pattern as the Slack integration
}

async function handleIssueComment(issue: IssueData, comment: CommentData, repo: RepoData): Promise<void> {
  const message = comment.body.replace(/@pablo/gi, '').trim();
  console.log(`[GitHub Webhook] Processing comment on issue #${issue.number} on ${repo.full_name}: ${message.slice(0, 100)}`);
}

async function handlePRReview(pr: PRData, repo: RepoData, headSha: string): Promise<void> {
  console.log(`[GitHub Webhook] Reviewing PR #${pr.number} on ${repo.full_name}`);

  try {
    // Fetch PR diff
    const token = process.env.GITHUB_APP_TOKEN || process.env.GITHUB_TOKEN;
    if (!token) {
      console.warn('[GitHub Webhook] No GitHub token for PR review');
      return;
    }

    const diffResponse = await fetch(
      `https://api.github.com/repos/${repo.full_name}/pulls/${pr.number}`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3.diff',
          'User-Agent': 'Pablo-IDE/2.0',
        },
      },
    );

    if (!diffResponse.ok) return;
    const diff = await diffResponse.text();

    // Run review
    const env = await getEnvConfig();
    const review: PRReviewResult = await reviewPR(diff, env);

    // Post review summary as PR comment
    await fetch(
      `https://api.github.com/repos/${repo.full_name}/issues/${pr.number}/comments`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': 'Pablo-IDE/2.0',
        },
        body: JSON.stringify({
          body: formatReviewComment(review),
        }),
      },
    );

    // Post inline comments
    for (const comment of review.comments) {
      await fetch(
        `https://api.github.com/repos/${repo.full_name}/pulls/${pr.number}/comments`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'Pablo-IDE/2.0',
          },
          body: JSON.stringify({
            body: `${severityEmoji(comment.severity)} ${comment.body}`,
            path: comment.path,
            line: comment.line,
            commit_id: headSha,
          }),
        },
      );
    }
  } catch (error) {
    console.error('[GitHub Webhook] PR review error:', error);
  }
}

function severityEmoji(severity: string): string {
  switch (severity) {
    case 'bug': return '🔴';
    case 'warning': return '🟡';
    case 'fyi': return '⚪';
    default: return '💬';
  }
}

function formatReviewComment(review: PRReviewResult): string {
  const emoji = review.lgtm ? '✅' : '⚠️';
  const bugs = review.comments.filter(c => c.severity === 'bug').length;
  const warnings = review.comments.filter(c => c.severity === 'warning').length;
  const fyi = review.comments.filter(c => c.severity === 'fyi').length;

  return `## Pablo Review ${emoji}

**Score: ${review.score}/100** ${review.lgtm ? '— LGTM!' : '— Needs attention'}

${review.summary}

| Category | Count |
|----------|-------|
| 🔴 Bugs | ${bugs} |
| 🟡 Warnings | ${warnings} |
| ⚪ FYI | ${fyi} |

---
*Reviewed by Pablo AI*`;
}
