/**
 * API Route: /api/business-rules
 *
 * CRUD for the BusinessRulesEngine (Phase 1 Enterprise spec).
 * GET  — list all rules (built-in + user-defined), optional ?category= filter
 * POST — create a new user-defined rule
 */

import { NextRequest } from 'next/server';
import { auth } from '@/lib/auth';
import {
  listBusinessRules,
  createBusinessRule,
  type RuleCategory,
  type RuleSeverity,
} from '@/lib/db/d1-business-rules';

const VALID_CATEGORIES: RuleCategory[] = [
  'naming', 'security', 'architecture', 'database', 'api',
  'testing', 'compliance', 'performance', 'accessibility', 'custom',
];
const VALID_SEVERITIES: RuleSeverity[] = ['error', 'warning', 'info'];

export async function GET(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const category = request.nextUrl.searchParams.get('category') as RuleCategory | null;
    if (category && !VALID_CATEGORIES.includes(category)) {
      return Response.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
    }
    const rules = await listBusinessRules(category ?? undefined);
    return Response.json(rules);
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[GET /api/business-rules]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const session = await auth();
  if (!session) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      title?: string;
      description?: string;
      category?: RuleCategory;
      severity?: RuleSeverity;
      pattern?: string;
      action?: string;
    };

    if (!body.title || !body.description || !body.category || !body.severity || !body.pattern || !body.action) {
      return Response.json(
        { error: 'title, description, category, severity, pattern, and action are all required' },
        { status: 400 },
      );
    }

    if (!VALID_CATEGORIES.includes(body.category)) {
      return Response.json({ error: `Invalid category. Must be one of: ${VALID_CATEGORIES.join(', ')}` }, { status: 400 });
    }
    if (!VALID_SEVERITIES.includes(body.severity)) {
      return Response.json({ error: `Invalid severity. Must be one of: ${VALID_SEVERITIES.join(', ')}` }, { status: 400 });
    }

    const rule = await createBusinessRule({
      title: body.title,
      description: body.description,
      category: body.category,
      severity: body.severity,
      pattern: body.pattern,
      action: body.action,
    });

    return Response.json(rule, { status: 201 });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error('[POST /api/business-rules]', err);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
