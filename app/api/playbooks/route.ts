/**
 * GET  /api/playbooks — List all playbooks (built-in + custom)
 * POST /api/playbooks — Create/update a custom playbook
 * DELETE /api/playbooks?id=xxx — Delete a custom playbook
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import { BUILTIN_PLAYBOOKS } from '@/lib/agents/playbooks';
import { d1GetPlaybooks, d1SavePlaybook, d1DeletePlaybook } from '@/lib/db/d1-playbooks';

export async function GET() {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const customPlaybooks = await d1GetPlaybooks();

    return Response.json({
      builtin: BUILTIN_PLAYBOOKS,
      custom: customPlaybooks,
    });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const body = await request.json() as {
      id: string;
      title: string;
      description: string;
      triggerPattern: string;
      steps: Array<{ title: string; type: 'generate' | 'modify' | 'verify' | 'command'; template: string; filePatterns: string[]; verifyCommand?: string }>;
      variables: string[];
    };

    if (!body.id || !body.title) {
      return Response.json({ error: 'id and title are required' }, { status: 400 });
    }

    await d1SavePlaybook(body, (session as { user?: { email?: string } }).user?.email);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const session = await auth();
    if (!session) return new Response('Unauthorized', { status: 401 });

    const id = request.nextUrl.searchParams.get('id');
    if (!id) {
      return Response.json({ error: 'id parameter required' }, { status: 400 });
    }

    await d1DeletePlaybook(id);
    return Response.json({ ok: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Internal error' },
      { status: 500 },
    );
  }
}
