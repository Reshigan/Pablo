/**
 * POST /api/slack — Slack Bot webhook handler (Events API)
 *
 * Handles:
 *   - url_verification: Slack challenge verification
 *   - event_callback: app_mention events
 *
 * When @pablo is mentioned in Slack:
 *   1. Parse the message for repo and task
 *   2. Call orchestrator API internally
 *   3. Post results back to the Slack thread
 */

import { NextRequest } from 'next/server';

/**
 * SEC-06: Verify Slack request signature using HMAC-SHA256.
 * See https://api.slack.com/authentication/verifying-requests-from-slack
 */
async function verifySlackSignature(rawBody: string, timestamp: string, signature: string): Promise<boolean> {
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!signingSecret) return false;
  if (!signature.startsWith('v0=')) return false;

  // Reject requests older than 5 minutes to prevent replay attacks
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) return false;

  const baseString = `v0:${timestamp}:${rawBody}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(signingSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, encoder.encode(baseString));
  const expected = 'v0=' + Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Constant-time comparison
  if (expected.length !== signature.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  }
  return mismatch === 0;
}

interface SlackEvent {
  type: string;
  challenge?: string;
  event?: {
    type: string;
    text: string;
    channel: string;
    thread_ts?: string;
    ts: string;
    user: string;
  };
}

async function postSlackMessage(channel: string, text: string, threadTs?: string): Promise<void> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) return;

  await fetch('https://slack.com/api/chat.postMessage', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      channel,
      text,
      thread_ts: threadTs,
    }),
  });
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();
    const timestamp = request.headers.get('x-slack-request-timestamp') || '';
    const signature = request.headers.get('x-slack-signature') || '';

    // SEC-06: Verify Slack signature (skip only if SLACK_SIGNING_SECRET not configured)
    if (process.env.SLACK_SIGNING_SECRET) {
      if (!(await verifySlackSignature(rawBody, timestamp, signature))) {
        return new Response('Invalid signature', { status: 401 });
      }
    }

    const body = JSON.parse(rawBody) as SlackEvent;

    // Slack URL verification
    if (body.type === 'url_verification') {
      return Response.json({ challenge: body.challenge });
    }

    // Handle events
    if (body.type === 'event_callback' && body.event?.type === 'app_mention') {
      const { text, channel, thread_ts, ts, user } = body.event;
      const threadId = thread_ts || ts;

      // Remove @pablo mention
      const message = text.replace(/<@\w+>/g, '').trim();

      if (!message) {
        await postSlackMessage(channel, 'What would you like me to do? Try: `@pablo fix the login bug in owner/repo-name`', threadId);
        return Response.json({ ok: true });
      }

      // Extract repo from message
      const repoMatch = message.match(/\b(?:in|on|for)\s+(\w+\/[\w.-]+)\b/i);
      const repo = repoMatch?.[1];

      if (!repo) {
        await postSlackMessage(channel, 'Which repo? Try: `@pablo fix the login bug in owner/repo-name`', threadId);
        return Response.json({ ok: true });
      }

      // Acknowledge immediately
      await postSlackMessage(channel, `Working on it... Task: "${message}" in ${repo}`, threadId);

      // Call orchestrator API asynchronously
      handleSlackTask(message, repo, channel, threadId, user).catch(console.error);

      return Response.json({ ok: true });
    }

    return Response.json({ ok: true });
  } catch (error) {
    console.error('[Slack] Webhook error:', error);
    return Response.json({ error: 'Internal error' }, { status: 500 });
  }
}

async function handleSlackTask(
  message: string,
  repo: string,
  channel: string,
  threadTs: string,
  userId: string,
): Promise<void> {
  try {
    const baseUrl = process.env.NEXTAUTH_URL || 'https://pablo.vantax.co.za';
    const apiKey = process.env.PABLO_INTERNAL_API_KEY;

    const response = await fetch(`${baseUrl}/api/orchestrate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { 'Authorization': `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        message,
        repo,
        source: 'slack',
        slackChannel: channel,
        slackThread: threadTs,
        slackUser: userId,
      }),
    });

    if (!response.ok) {
      await postSlackMessage(channel, `Failed to start task: ${response.status}`, threadTs);
      return;
    }

    // Consume SSE stream and wait for 'done' or 'error' event
    const reader = response.body?.getReader();
    if (!reader) {
      await postSlackMessage(channel, 'Task started but could not read stream.', threadTs);
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';
    let summary = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(line.slice(6)) as { type: string; summary?: string; message?: string };
          if (event.type === 'done') {
            summary = event.summary || 'Task complete!';
          } else if (event.type === 'error') {
            await postSlackMessage(channel, `Task failed: ${event.message || 'Unknown error'}`, threadTs);
            return;
          }
        } catch {
          // Skip malformed SSE lines
        }
      }
    }

    await postSlackMessage(channel, summary || 'Task complete! Check the repo for changes.', threadTs);
  } catch (error) {
    await postSlackMessage(
      channel,
      `Error: ${error instanceof Error ? error.message : 'Unknown'}`,
      threadTs,
    );
  }
}
