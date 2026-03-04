// lib/agents/specialists/frontendAgent.ts
// Builds React/Next.js components, pages, and client-side logic

import { BaseAgent, getUpstream, type AgentInput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Frontend Agent — a senior React/Next.js developer.

RULES:
- Next.js App Router: page.tsx for pages, layout.tsx for layouts, loading.tsx for suspense
- 'use client' directive for interactive components (forms, modals, state)
- Tailwind CSS utility classes only (no custom CSS files)
- Zustand for client state management
- Zod for form validation
- Accessibility: ARIA labels, keyboard nav, semantic HTML
- Every component must have: loading state, error boundary, empty state
- Use lucide-react for icons
- Import types explicitly with \`type\` keyword
- No \`any\` types — use proper generics and interfaces

OUTPUT: Generate complete file contents in markdown code blocks with file paths:
\`\`\`tsx
// filepath: src/components/MyComponent.tsx
'use client';
import { useState } from 'react';
// ... full component code
\`\`\`

Generate ALL files assigned to you. Each file must be complete and immediately runnable.`;

export class FrontendAgent extends BaseAgent {
  constructor() {
    super({
      name: 'FrontendAgent',
      role: 'Frontend Developer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'qwen3-coder:480b',
        description: 'Qwen3-Coder 480B for frontend code generation',
        max_tokens: 16384,
        temperature: 0.2,
        estimated_speed: '30-100 TPS',
      },
      fileScope: [
        /^src\/components\//,
        /^src\/app\/.*page\.tsx$/,
        /^src\/app\/.*layout\.tsx$/,
        /^src\/app\/.*loading\.tsx$/,
        /^src\/stores\//,
        /^components\//,
        /^app\/.*page\.tsx$/,
        /^app\/.*layout\.tsx$/,
        /^stores\//,
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
    }>>(input.upstreamOutputs, 'ArchitectAgent', 'apiContracts');

    if (apiContracts && apiContracts.length > 0) {
      parts.push('\nAPI CONTRACTS (from Architect):');
      for (const api of apiContracts) {
        parts.push(`  ${api.method} ${api.path} — ${api.description}`);
        parts.push(`    Request: ${JSON.stringify(api.requestParams)}`);
        parts.push(`    Response: ${JSON.stringify(api.responseShape)}`);
      }
    }

    // Read task assignments
    const taskAssignments = getUpstream<Record<string, string[]>>(
      input.upstreamOutputs, 'ArchitectAgent', 'taskAssignments'
    );
    if (taskAssignments?.FrontendAgent) {
      parts.push(`\nFILES TO CREATE: ${taskAssignments.FrontendAgent.join(', ')}`);
    }

    // Read design tokens from DesignAgent (if available)
    const designTokens = getUpstream<Record<string, unknown>>(
      input.upstreamOutputs, 'DesignAgent', 'designTokens'
    );
    if (designTokens) {
      parts.push(`\nDESIGN TOKENS: ${JSON.stringify(designTokens)}`);
    }

    // Existing files for context
    if (input.projectContext.existingFiles.size > 0) {
      const relevantFiles = Array.from(input.projectContext.existingFiles.entries())
        .filter(([path]) => /\.(tsx?|jsx?)$/.test(path))
        .slice(0, 10);
      if (relevantFiles.length > 0) {
        parts.push('\nEXISTING FILES FOR REFERENCE:');
        for (const [path, content] of relevantFiles) {
          const truncated = content.length > 500 ? content.slice(0, 500) + '\n// ... truncated' : content;
          parts.push(`\n--- ${path} ---\n${truncated}`);
        }
      }
    }

    parts.push('\nGenerate all frontend files as complete code blocks with file paths in comments.');

    return parts.join('\n');
  }
}
