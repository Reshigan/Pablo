// lib/agents/specialists/databaseAgent.ts
// Database schema design, migrations, and CRUD modules for D1 (SQLite)

import { BaseAgent, getUpstream, type AgentInput, type AgentOutput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Database Agent — a senior database engineer specializing in Cloudflare D1 (SQLite).

RULES:
- D1 is SQLite: TEXT for dates (ISO 8601), no ENUM, no stored procedures, no triggers
- Migration safety: never DROP COLUMN in production, always add nullable columns
- Index strategy: index foreign keys and frequently-queried columns
- Use TEXT PRIMARY KEY with UUID/nanoid patterns
- Always include created_at and updated_at columns
- Seed data generation: realistic test data, not lorem ipsum
- CRUD modules: export typed functions (create, getById, list, update, delete)
- Use prepare().bind().run() pattern for D1 queries

OUTPUT: Generate files in markdown code blocks with file paths:
1. Schema definition file
2. SQL migration file(s)
3. CRUD module with typed functions
4. Seed data (optional)

\`\`\`sql
-- filepath: migrations/0001_init.sql
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ...
);
\`\`\`

\`\`\`typescript
// filepath: src/lib/db/schema.ts
// ... typed schema and CRUD functions
\`\`\``;

export class DatabaseAgent extends BaseAgent {
  constructor() {
    super({
      name: 'DatabaseAgent',
      role: 'Database Engineer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'qwen2.5-coder:32b',
        description: 'Qwen2.5-Coder 32B for database schema design',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '40-80 TPS',
      },
      fileScope: [
        /^src\/lib\/db\//,
        /^lib\/db\//,
        /^migrations\//,
        /^drizzle\.config/,
      ],
      maxOutputTokens: 16384,
      temperature: 0.2,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Read entities from ArchitectAgent
    const entities = getUpstream<Array<{
      name: string;
      fields: Array<{ name: string; type: string; primary?: boolean; required?: boolean }>;
    }>>(input.upstreamOutputs, 'ArchitectAgent', 'entities');

    if (entities && entities.length > 0) {
      parts.push('\nENTITIES TO MODEL:');
      for (const entity of entities) {
        parts.push(`\n  ${entity.name}:`);
        for (const field of entity.fields) {
          parts.push(`    - ${field.name}: ${field.type}${field.primary ? ' (PRIMARY KEY)' : ''}${field.required ? ' (NOT NULL)' : ''}`);
        }
      }
    }

    // Task assignments
    const taskAssignments = getUpstream<Record<string, string[]>>(
      input.upstreamOutputs, 'ArchitectAgent', 'taskAssignments'
    );
    if (taskAssignments?.DatabaseAgent) {
      parts.push(`\nFILES TO CREATE: ${taskAssignments.DatabaseAgent.join(', ')}`);
    }

    parts.push('\nGenerate: 1) SQL migration, 2) TypeScript schema with CRUD functions, 3) Seed data if appropriate.');

    return parts.join('\n');
  }

  parseResponse(response: string): Partial<AgentOutput> {
    const base = super.parseResponse(response);

    // Extract schema artifact from the generated files
    const schemaFile = base.files?.find(f => f.path.includes('schema') || f.path.includes('db/'));
    const migrationFile = base.files?.find(f => f.path.includes('migration') || f.path.endsWith('.sql'));

    return {
      ...base,
      artifacts: {
        schema: schemaFile?.content ?? '',
        migrations: migrationFile?.content ?? '',
        crud: schemaFile?.content ?? '',
      },
    };
  }
}
