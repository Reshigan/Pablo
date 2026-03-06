// lib/agents/specialists/backendAgent.ts
// Builds API routes, server-side logic, and middleware

import { BaseAgent, getUpstream, type AgentInput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Backend Agent — a senior backend developer specializing in Next.js API routes on Cloudflare Workers.

RULES:
- Next.js Route Handlers: export async function GET/POST/PUT/DELETE(request: NextRequest)
- Input validation with Zod: validate every request body and query param
- Error handling: try/catch every handler, return structured JSON errors with proper HTTP codes
- D1 access pattern: getCloudflareContext → ctx.env.DB → db.prepare().bind().all()
- Auth check: const session = await auth(); if (!session) return 401;
- Never expose internal errors to client — return generic messages
- Rate limiting headers where appropriate
- CORS headers for API routes
- Use TypeScript strict types — no \`any\`

OUTPUT: Generate complete file contents in markdown code blocks with file paths:
\`\`\`typescript
// filepath: src/app/api/products/route.ts
import { NextRequest, NextResponse } from 'next/server';
// ... full route handler code
\`\`\`

Generate ALL files assigned to you. Each file must be complete and immediately runnable.`;

export class BackendAgent extends BaseAgent {
  constructor() {
    super({
      name: 'BackendAgent',
      role: 'Backend Developer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'devstral-2:123b',
        description: 'Devstral-2 123B for backend code generation',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '15-30 TPS',
      },
      fileScope: [
        /^src\/app\/api\//,
        /^src\/lib\//,
        /^app\/api\//,
        /^lib\//,
        /^middleware\.ts$/,
      ],
      maxOutputTokens: 16384,
      temperature: 0.2,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Read API contracts from ArchitectAgent
    const apiContracts = getUpstream<Array<{
      method: string;
      path: string;
      description: string;
      requestParams: Record<string, string>;
      responseShape: Record<string, string>;
      auth: boolean;
    }>>(input.upstreamOutputs, 'ArchitectAgent', 'apiContracts');

    if (apiContracts && apiContracts.length > 0) {
      parts.push('\nAPI CONTRACTS TO IMPLEMENT:');
      for (const api of apiContracts) {
        parts.push(`  ${api.method} ${api.path} — ${api.description}`);
        parts.push(`    Auth required: ${api.auth}`);
        parts.push(`    Request: ${JSON.stringify(api.requestParams)}`);
        parts.push(`    Response: ${JSON.stringify(api.responseShape)}`);
      }
    }

    // Read entities from ArchitectAgent
    const entities = getUpstream<Array<{
      name: string;
      fields: Array<{ name: string; type: string; primary?: boolean; required?: boolean }>;
    }>>(input.upstreamOutputs, 'ArchitectAgent', 'entities');

    if (entities && entities.length > 0) {
      parts.push('\nDATA ENTITIES:');
      for (const entity of entities) {
        const fields = entity.fields.map(f =>
          `${f.name}: ${f.type}${f.primary ? ' (PK)' : ''}${f.required ? ' (required)' : ''}`
        ).join(', ');
        parts.push(`  ${entity.name}: { ${fields} }`);
      }
    }

    // Read schema from DatabaseAgent (if available)
    const schema = getUpstream<string>(input.upstreamOutputs, 'DatabaseAgent', 'schema');
    if (schema) {
      parts.push(`\nDATABASE SCHEMA (from DatabaseAgent):\n${schema}`);
    }

    // Task assignments
    const taskAssignments = getUpstream<Record<string, string[]>>(
      input.upstreamOutputs, 'ArchitectAgent', 'taskAssignments'
    );
    if (taskAssignments?.BackendAgent) {
      parts.push(`\nFILES TO CREATE: ${taskAssignments.BackendAgent.join(', ')}`);
    }

    parts.push('\nGenerate all backend files as complete code blocks with file paths in comments.');

    return parts.join('\n');
  }
}
