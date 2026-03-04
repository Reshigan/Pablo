// lib/agents/specialists/docsAgent.ts
// Documentation generation: README, API docs, CHANGELOG, JSDoc comments

import { BaseAgent, getUpstream, getUpstreamFiles, type AgentInput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Docs Agent — a technical writer who produces clear, comprehensive documentation.

PRODUCES:
- README.md — project overview, setup instructions, environment variables, scripts
- docs/API.md — endpoint documentation from API contracts
- CHANGELOG.md — what was built in this session
- JSDoc comments added to exported functions (edits existing files)

RULES:
- Use clear, concise language
- Include code examples for API endpoints
- Document all environment variables with descriptions
- Include setup steps that actually work (npm install, migrations, etc.)
- For API docs: method, path, auth, request body, response shape, error codes
- CHANGELOG follows Keep a Changelog format

OUTPUT: Generate complete files in markdown code blocks with file paths:
\`\`\`markdown
<!-- filepath: README.md -->
# Project Name
...
\`\`\`

You MAY also modify files from other agents by adding JSDoc comments. Include the full modified file.`;

export class DocsAgent extends BaseAgent {
  constructor() {
    super({
      name: 'DocsAgent',
      role: 'Technical Writer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'gpt-oss:120b',
        description: 'GPT-OSS 120B for documentation generation',
        max_tokens: 16384,
        temperature: 0.3,
        estimated_speed: '40-80 TPS',
      },
      fileScope: [
        /^README\.md$/,
        /^CHANGELOG\.md$/,
        /^docs\//,
        /^LICENSE$/,
        // DocsAgent can modify any file to add JSDoc comments
        /\.(ts|tsx|js|jsx)$/,
      ],
      maxOutputTokens: 16384,
      temperature: 0.3,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Read ALL upstream files
    const upstreamFiles = getUpstreamFiles(input.upstreamOutputs);
    if (upstreamFiles.length > 0) {
      parts.push(`\nGENERATED FILES (${upstreamFiles.length} total):`);
      for (const file of upstreamFiles) {
        const truncated = file.content.length > 1500
          ? file.content.slice(0, 1500) + '\n// ... truncated'
          : file.content;
        parts.push(`\n--- ${file.path} ---\n${truncated}`);
      }
    }

    // Read API contracts
    const apiContracts = getUpstream<Array<{
      method: string;
      path: string;
      description: string;
      requestParams: Record<string, string>;
      responseShape: Record<string, string>;
      auth: boolean;
    }>>(input.upstreamOutputs, 'ArchitectAgent', 'apiContracts');

    if (apiContracts && apiContracts.length > 0) {
      parts.push('\nAPI CONTRACTS:');
      for (const api of apiContracts) {
        parts.push(`  ${api.method} ${api.path} — ${api.description} (auth: ${api.auth})`);
      }
    }

    // Read architecture decisions
    const architecture = getUpstream<{ stack: string; decisions: Array<{ decision: string; reason: string }> }>(
      input.upstreamOutputs, 'ArchitectAgent', 'architecture'
    );
    if (architecture) {
      parts.push(`\nARCHITECTURE: ${architecture.stack}`);
    }

    parts.push('\nGenerate: README.md, docs/API.md (if API contracts exist), and CHANGELOG.md.');

    return parts.join('\n');
  }
}
