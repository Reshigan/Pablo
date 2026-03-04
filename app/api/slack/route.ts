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
    const body = await request.json() as SlackEvent;

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
