/**
 * API Route: /api/business-rules/[id]
 *
 * PATCH  — update a user-defined rule
 * DELETE — delete a user-defined rule (built-in rules cannot be deleted)
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  updateBusinessRule,
  deleteBusinessRule,
  type RuleCategory,
  type RuleSeverity,
} from '@/lib/db/d1-business-rules';

const VALID_CATEGORIES: RuleCategory[] = [
  'naming', 'security', 'architecture', 'database', 'api',
  'testing', 'compliance', 'performance', 'accessibility', 'custom',
];
const VALID_SEVERITIES: RuleSeverity[] = ['error', 'warning', 'info'];

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await params;
    if (id.startsWith('builtin_')) {
      return Response.json({ error: 'Built-in rules cannot be modified' }, { status: 403 });
    }

    const body = (await request.json()) as Partial<{
      title: string;
      description: string;
      category: RuleCategory;
      severity: RuleSeverity;
      pattern: string;
      action: string;
      enabled: boolean;
    }>;

    if (body.category && !VALID_CATEGORIES.includes(body.category)) {
      return Response.json({ error: `Invalid category` }, { status: 400 });
    }
    if (body.severity && !VALID_SEVERITIES.includes(body.severity)) {
      return Response.json({ error: `Invalid severity` }, { status: 400 });
    }

    const updated = await updateBusinessRule(id, body);
    if (!updated) {
      return Response.json({ error: 'Rule not found or is built-in' }, { status: 404 });
    }
    return Response.json(updated);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[PATCH /api/business-rules/[id]]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const { id } = await params;
    if (id.startsWith('builtin_')) {
      return Response.json({ error: 'Built-in rules cannot be deleted' }, { status: 403 });
    }

    const deleted = await deleteBusinessRule(id);
    if (!deleted) {
      return Response.json({ error: 'Rule not found or is built-in' }, { status: 404 });
    }
    return Response.json({ success: true });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[DELETE /api/business-rules/[id]]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
