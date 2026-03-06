// lib/agents/specialists/reviewAgent.ts
// Code review — reads all generated code and produces review comments

import { BaseAgent, getUpstreamFiles, type AgentInput, type AgentOutput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Review Agent — a senior code reviewer focused on quality, maintainability, and best practices.

CHECKLIST:
- No magic numbers — use named constants
- No god functions (>50 lines) — break into smaller functions
- No deeply nested callbacks — use async/await, early returns
- Naming conventions: camelCase for JS/TS, PascalCase for components, UPPER_SNAKE for constants
- Import organization: external libs first, then internal imports, then relative imports
- Error handling: every async function should handle errors
- Performance: no unnecessary re-renders, memoize expensive computations
- DRY: flag duplicated logic across files
- TypeScript: no \`any\` types, use proper generics
- Accessibility: components have proper ARIA attributes
- Testing: generated code should be testable (dependency injection, pure functions)

OUTPUT FORMAT — respond with ONLY a JSON object:
{
  "reviewReport": {
    "approved": true,
    "summary": "Overall assessment",
    "comments": [
      { "file": "path", "line": 15, "severity": "error|warning|info", "comment": "description" }
    ],
    "suggestions": [
      { "file": "path", "description": "Improvement suggestion" }
    ]
  }
}

Set "approved" to false if any error-severity comments exist.`;

export class ReviewAgent extends BaseAgent {
  constructor() {
    super({
      name: 'ReviewAgent',
      role: 'Code Reviewer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'devstral-2:123b',
        description: 'Qwen3 32B for code review reasoning',
        max_tokens: 16384,
        temperature: 0.1,
        estimated_speed: '40-80 TPS',
      },
      fileScope: [], // ReviewAgent writes no files
      maxOutputTokens: 16384,
      temperature: 0.1,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`CODE REVIEW REQUEST: ${input.userMessage}`);

    // Get all upstream files to review
    const upstreamFiles = getUpstreamFiles(input.upstreamOutputs);
    if (upstreamFiles.length > 0) {
      parts.push('\nFILES TO REVIEW:');
      for (const file of upstreamFiles) {
        parts.push(`\n--- ${file.path} (${file.language}) ---\n${file.content}`);
      }
    }

    parts.push('\nPerform a thorough code review. Output ONLY a JSON object with the reviewReport. No markdown fences.');

    return parts.join('\n');
  }

  parseResponse(response: string): Partial<AgentOutput> {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return { files: [], artifacts: { reviewReport: { approved: true, summary: 'No review data', comments: [], suggestions: [] } }, issues: [] };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;
      const report = (parsed.reviewReport ?? parsed) as {
        approved?: boolean;
        summary?: string;
        comments?: Array<{ file: string; line?: number; severity: string; comment: string }>;
        suggestions?: Array<{ file: string; description: string }>;
      };

      const issues: string[] = [];
      if (report.comments) {
        for (const c of report.comments) {
          if (c.severity === 'error') {
            issues.push(`REVIEW ERROR: ${c.comment} in ${c.file}${c.line ? `:${c.line}` : ''}`);
          }
        }
      }

      return {
        files: [],
        artifacts: { reviewReport: report },
        issues,
      };
    } catch {
      return {
        files: [],
        artifacts: { reviewReport: { approved: true, summary: 'Review parsing failed', comments: [], suggestions: [] } },
        issues: [],
      };
    }
  }
}
