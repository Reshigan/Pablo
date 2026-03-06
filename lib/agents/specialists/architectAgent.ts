// lib/agents/specialists/architectAgent.ts
// System design, API contracts, entity modeling, file structure planning

import { BaseAgent, getUpstream, type AgentInput, type AgentOutput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Architect Agent — a senior systems architect specializing in Next.js + Cloudflare Workers + D1 (SQLite) applications.

Your job is to produce a comprehensive architecture plan that downstream agents consume.

PRINCIPLES:
- SOLID principles
- Next.js App Router patterns (Server Components vs Client Components)
- Cloudflare Workers constraints: no filesystem, 128MB memory, 30s CPU limit, D1 is SQLite
- RESTful API design
- Standard Next.js file structures

OUTPUT FORMAT — respond with ONLY a JSON object (no markdown fences):
{
  "architecture": {
    "stack": "Next.js 16 + Cloudflare Workers + D1",
    "decisions": [{ "decision": "string", "reason": "string" }],
    "diagram": "Mermaid graph TD string"
  },
  "apiContracts": [{
    "method": "GET|POST|PUT|DELETE",
    "path": "/api/...",
    "description": "string",
    "requestParams": {},
    "responseShape": {},
    "auth": true
  }],
  "entities": [{
    "name": "string",
    "fields": [{ "name": "string", "type": "text|integer|real", "primary": false, "required": false }]
  }],
  "fileStructure": ["src/app/page.tsx", "..."],
  "taskAssignments": {
    "FrontendAgent": ["file paths"],
    "BackendAgent": ["file paths"],
    "DatabaseAgent": ["file paths"],
    "TestAgent": ["file paths"]
  }
}

Default to Cloudflare Workers + D1 + Next.js unless the user specifies otherwise.
Do NOT generate code files — only the architecture plan as JSON.`;

export class ArchitectAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ArchitectAgent',
      role: 'Systems Architect',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'devstral-2:123b',
        description: 'Devstral-2 123B for architecture reasoning',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '15-30 TPS',
      },
      fileScope: [], // ArchitectAgent doesn't write code files
      maxOutputTokens: 16384,
      temperature: 0.2,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    // User request
    parts.push(`USER REQUEST: ${input.userMessage}`);

    // PMAgent requirements (if available)
    const requirements = getUpstream<{ summary: string; features: string[] }>(
      input.upstreamOutputs, 'PMAgent', 'requirements'
    );
    if (requirements) {
      parts.push(`\nREQUIREMENTS FROM PM:\nSummary: ${requirements.summary}\nFeatures: ${requirements.features.join(', ')}`);
    }

    // Existing file list from codebase index
    if (input.projectContext.codebaseIndex) {
      const fileList = input.projectContext.codebaseIndex.files
        .map(f => `  ${f.path} (${f.type})`)
        .slice(0, 100)
        .join('\n');
      parts.push(`\nEXISTING PROJECT FILES (${input.projectContext.codebaseIndex.totalFiles} total):\n${fileList}`);
    }

    // Existing files in context
    if (input.projectContext.existingFiles.size > 0) {
      const fileNames = Array.from(input.projectContext.existingFiles.keys()).slice(0, 50);
      parts.push(`\nFILES IN CONTEXT: ${fileNames.join(', ')}`);
    }

    parts.push('\nProduce the architecture plan as a JSON object. No markdown fences, no explanations — just the JSON.');

    return parts.join('\n');
  }

  parseResponse(response: string): Partial<AgentOutput> {
    try {
      // Try to extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { files: [], artifacts: {}, issues: ['ArchitectAgent: No JSON found in response'] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      return {
        files: [],
        artifacts: {
          architecture: parsed.architecture ?? {},
          apiContracts: parsed.apiContracts ?? [],
          entities: parsed.entities ?? [],
          fileStructure: parsed.fileStructure ?? [],
          taskAssignments: parsed.taskAssignments ?? {},
        },
        issues: [],
      };
    } catch (error) {
      return {
        files: [],
        artifacts: {},
        issues: [`ArchitectAgent: Failed to parse JSON — ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }
}
