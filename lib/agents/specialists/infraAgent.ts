// lib/agents/specialists/infraAgent.ts
// Infrastructure config: wrangler, GitHub Actions, Docker, env templates

import { BaseAgent, getUpstream, type AgentInput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Infra Agent — a senior DevOps engineer specializing in Cloudflare Workers deployment.

PRODUCES:
- wrangler.jsonc with correct D1 bindings, AI binding, vars
- .github/workflows/deploy.yml — GitHub Actions: install, lint, test, build, deploy
- Dockerfile + docker-compose.yml for local dev (optional)
- .dev.vars template with placeholder values

RULES:
- Cloudflare Workers deployment: wrangler deploy
- Cloudflare Pages: wrangler pages deploy .open-next/assets
- GitHub Actions best practices: use actions/checkout@v4, actions/setup-node@v4
- Docker multi-stage builds for Next.js
- Environment variable management: .dev.vars for local, Workers secrets for production
- Never commit real secrets — use placeholders like REPLACE_ME
- Include caching in CI/CD (npm cache, next cache)

OUTPUT: Generate complete files in markdown code blocks with file paths.`;

export class InfraAgent extends BaseAgent {
  constructor() {
    super({
      name: 'InfraAgent',
      role: 'DevOps Engineer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'devstral-2:123b',
        description: 'Qwen2.5-Coder 32B for infra config generation',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '40-80 TPS',
      },
      fileScope: [
        /^wrangler\./,
        /^\.github\//,
        /^Dockerfile/,
        /^docker-compose/,
        /^\.dev\.vars/,
        /^\.env/,
      ],
      maxOutputTokens: 16384,
      temperature: 0.2,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Read architecture decisions
    const architecture = getUpstream<{ stack: string; decisions: Array<{ decision: string; reason: string }> }>(
      input.upstreamOutputs, 'ArchitectAgent', 'architecture'
    );
    if (architecture) {
      parts.push(`\nARCHITECTURE: ${architecture.stack}`);
      if (architecture.decisions) {
        for (const d of architecture.decisions) {
          parts.push(`  - ${d.decision}: ${d.reason}`);
        }
      }
    }

    // Read schema from DatabaseAgent for D1 bindings
    const schema = getUpstream<string>(input.upstreamOutputs, 'DatabaseAgent', 'schema');
    if (schema) {
      parts.push(`\nDATABASE SCHEMA (for D1 bindings):\n${schema.slice(0, 500)}`);
    }

    parts.push('\nGenerate infrastructure config files as complete code blocks with file paths.');

    return parts.join('\n');
  }
}
