// lib/agents/specialists/securityAgent.ts
// Security auditing — reads all generated code and produces audit report

import { BaseAgent, getUpstreamFiles, type AgentInput, type AgentOutput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Security Agent — a senior application security engineer.

You do NOT generate code files. You read all generated code and produce a security audit report.

CHECKLIST (OWASP Top 10 + extras):
- SQL injection: even with ORM — check raw queries, string interpolation in SQL
- XSS: dangerouslySetInnerHTML, unescaped user input in JSX
- CSRF: all state-changing routes need CSRF tokens or SameSite cookies
- Auth: sessions must expire, passwords must be hashed (bcrypt/argon2), tokens rotated
- Secrets: no API keys, passwords, or tokens hardcoded in source
- Input validation: all user input must be validated (Zod, etc.)
- Rate limiting: API routes should have rate limits
- Error handling: no stack traces leaked to client
- Dependencies: flag known-vulnerable patterns
- Data protection: personal data needs consent, deletion capability

OUTPUT FORMAT — respond with ONLY a JSON object:
{
  "securityReport": {
    "score": 85,
    "critical": [
      { "file": "path", "line": 42, "issue": "description", "fix": "how to fix" }
    ],
    "warnings": [
      { "file": "path", "line": 10, "issue": "description", "fix": "how to fix" }
    ],
    "info": [
      { "file": "path", "issue": "description" }
    ],
    "passed": true
  }
}

Set "passed" to false if ANY critical issues exist. The orchestrator will BLOCK deployment if passed is false.`;

export class SecurityAgent extends BaseAgent {
  constructor() {
    super({
      name: 'SecurityAgent',
      role: 'Security Engineer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'devstral-2:123b',
        description: 'Qwen3 32B for security reasoning',
        max_tokens: 16384,
        temperature: 0.1,
        estimated_speed: '40-80 TPS',
      },
      fileScope: [], // SecurityAgent writes no files
      maxOutputTokens: 16384,
      temperature: 0.1,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`SECURITY AUDIT REQUEST: ${input.userMessage}`);

    // Get all upstream files to audit
    const upstreamFiles = getUpstreamFiles(input.upstreamOutputs);
    if (upstreamFiles.length > 0) {
      parts.push('\nFILES TO AUDIT:');
      for (const file of upstreamFiles) {
        parts.push(`\n--- ${file.path} (${file.language}) ---\n${file.content}`);
      }
    }

    parts.push('\nPerform a thorough security audit. Output ONLY a JSON object with the securityReport. No markdown fences.');

    return parts.join('\n');
  }

  parseResponse(response: string): Partial<AgentOutput> {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { files: [], artifacts: { securityReport: { score: 0, critical: [], warnings: [], info: [], passed: false } }, issues: ['SecurityAgent: No JSON found in response'] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const report = (parsed.securityReport ?? parsed) as {
        score?: number;
        critical?: Array<{ file: string; line?: number; issue: string; fix?: string }>;
        warnings?: Array<{ file: string; line?: number; issue: string; fix?: string }>;
        info?: Array<{ file: string; issue: string }>;
        passed?: boolean;
      };

      const issues: string[] = [];
      if (report.critical && report.critical.length > 0) {
        for (const c of report.critical) {
          issues.push(`CRITICAL: ${c.issue} in ${c.file}${c.line ? `:${c.line}` : ''}`);
        }
      }

      return {
        files: [], // SecurityAgent writes no files
        artifacts: { securityReport: report },
        issues,
      };
    } catch (error) {
      return {
        files: [],
        artifacts: { securityReport: { score: 0, critical: [], warnings: [], info: [], passed: false } },
        issues: [`SecurityAgent: Failed to parse report — ${error instanceof Error ? error.message : 'unknown error'}`],
      };
    }
  }
}
