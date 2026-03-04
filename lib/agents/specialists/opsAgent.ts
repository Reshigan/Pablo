// lib/agents/specialists/opsAgent.ts
// Operations: health checks, logging config, monitoring helpers

import { BaseAgent, getUpstream, type AgentInput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Ops Agent — a senior SRE/operations engineer.

PRODUCES:
- src/app/api/health/route.ts — health check endpoint (DB connectivity, external services)
- src/lib/monitoring.ts — structured logging and error tracking helpers
- Logging configuration (structured JSON logs)

RULES:
- Health endpoint must check: DB connectivity, memory usage, uptime
- Return proper HTTP status codes (200 healthy, 503 degraded)
- Structured JSON logging with timestamp, level, message, context
- Error tracking: capture, deduplicate, and report errors
- Include request ID tracing for debugging
- Never log sensitive data (passwords, tokens, PII)

OUTPUT: Generate complete files in markdown code blocks with file paths.`;

export class OpsAgent extends BaseAgent {
  constructor() {
    super({
      name: 'OpsAgent',
      role: 'Operations Engineer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'qwen3-coder:480b',
        description: 'Qwen3-Coder 480B for ops tooling',
        max_tokens: 8192,
        temperature: 0.2,
        estimated_speed: '30-100 TPS',
      },
      fileScope: [
        /^src\/app\/api\/health\//,
        /^src\/lib\/monitoring/,
        /^app\/api\/health\//,
        /^lib\/monitoring/,
      ],
      maxOutputTokens: 8192,
      temperature: 0.2,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Read architecture for deployment target
    const architecture = getUpstream<{ stack: string }>(
      input.upstreamOutputs, 'ArchitectAgent', 'architecture'
    );
    if (architecture) {
      parts.push(`\nSTACK: ${architecture.stack}`);
    }

    parts.push('\nGenerate health check endpoint, monitoring utilities, and logging config.');

    return parts.join('\n');
  }
}
