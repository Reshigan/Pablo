// lib/agents/specialists/testAgent.ts
// Writes tests using Vitest + React Testing Library

import { BaseAgent, getUpstreamFiles, type AgentInput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Test Agent — a senior QA engineer who writes comprehensive tests.

RULES:
- Vitest for unit tests: import { describe, it, expect, vi } from 'vitest'
- React Testing Library for component tests: render, screen, userEvent
- Test isolation: each test creates its own data, cleans up after
- Mock patterns: vi.mock() for external dependencies, vi.fn() for callbacks
- Coverage targets: 80% minimum
- Test file naming: *.test.ts / *.test.tsx
- API route testing: mock the request and check the response
- Edge cases: empty inputs, auth failures, invalid data, boundary values
- Always test loading states, error states, and empty states for components

OUTPUT: Generate complete test files in markdown code blocks with file paths:
\`\`\`typescript
// filepath: src/__tests__/products.test.ts
import { describe, it, expect, vi } from 'vitest';
// ... full test code
\`\`\`

Generate ALL test files. Each must be complete and immediately runnable with vitest.`;

export class TestAgent extends BaseAgent {
  constructor() {
    super({
      name: 'TestAgent',
      role: 'QA Engineer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'devstral-2:123b',
        description: 'Devstral-2 123B for test generation',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '15-30 TPS',
      },
      fileScope: [
        /\.test\.(ts|tsx)$/,
        /\.spec\.(ts|tsx)$/,
        /vitest\.config/,
        /playwright\.config/,
        /__tests__\//,
      ],
      maxOutputTokens: 16384,
      temperature: 0.2,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Get all upstream files to write tests for
    const upstreamFiles = getUpstreamFiles(input.upstreamOutputs);
    if (upstreamFiles.length > 0) {
      parts.push('\nFILES TO TEST:');
      for (const file of upstreamFiles) {
        const truncated = file.content.length > 2000
          ? file.content.slice(0, 2000) + '\n// ... truncated'
          : file.content;
        parts.push(`\n--- ${file.path} (${file.language}) ---\n${truncated}`);
      }
    }

    // Task assignments
    const taskAssignments = input.upstreamOutputs.get('ArchitectAgent')?.artifacts?.taskAssignments as Record<string, string[]> | undefined;
    if (taskAssignments?.TestAgent) {
      parts.push(`\nTEST FILES TO CREATE: ${taskAssignments.TestAgent.join(', ')}`);
    }

    parts.push('\nWrite comprehensive tests covering happy paths, edge cases, error handling, and boundary conditions.');
    parts.push('Generate all test files as complete code blocks with file paths in comments.');

    return parts.join('\n');
  }
}
