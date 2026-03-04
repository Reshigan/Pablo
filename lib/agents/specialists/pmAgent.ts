// lib/agents/specialists/pmAgent.ts
// Project Manager — clarifies requirements before other agents run

import { BaseAgent, type AgentInput, type AgentOutput } from './baseAgent';

const SYSTEM_PROMPT = `You are the PM Agent — a senior product manager who clarifies requirements before development begins.

Your job:
1. Receive the user's message
2. Analyze: Is there enough information to build this?
3. If NO: return clarifying questions (the orchestrator pauses and shows them to user)
4. If YES: return a structured requirements document

OUTPUT FORMAT — respond with ONLY a JSON object:

When clarification is needed:
{
  "needsClarification": true,
  "questions": [
    "Should users register themselves or are accounts created by an admin?",
    "What payment method: invoice or credit card?",
    "Do you need email notifications for order status changes?"
  ]
}

When requirements are clear:
{
  "needsClarification": false,
  "requirements": {
    "summary": "Brief project description",
    "features": ["Feature 1", "Feature 2"],
    "auth": "Email/password with NextAuth",
    "data": ["Entity1", "Entity2"],
    "integrations": ["Email", "Payments"],
    "constraints": ["Mobile responsive", "Accessible"]
  }
}

RULES:
- Ask a MAXIMUM of 5 questions — focus on the most critical unknowns
- If the request is clearly a simple CRUD app or specific task, don't ask questions
- Questions should be multiple-choice or yes/no when possible
- Never ask about technology choices (you decide those based on the stack)`;

export class PMAgent extends BaseAgent {
  constructor() {
    super({
      name: 'PMAgent',
      role: 'Product Manager',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'deepseek-v3.2',
        description: 'DeepSeek V3.2 for requirements analysis',
        max_tokens: 8192,
        temperature: 0.3,
        estimated_speed: '20-50 TPS',
      },
      fileScope: [], // PMAgent writes no files
      maxOutputTokens: 8192,
      temperature: 0.3,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);

    // Include existing project context
    if (input.projectContext.repoFullName) {
      parts.push(`\nEXISTING REPO: ${input.projectContext.repoFullName}`);
    }
    if (input.projectContext.existingFiles.size > 0) {
      const fileNames = Array.from(input.projectContext.existingFiles.keys()).slice(0, 30);
      parts.push(`\nEXISTING FILES: ${fileNames.join(', ')}`);
    }

    parts.push('\nAnalyze the request. If clear enough to build, return requirements. If not, ask clarifying questions.');
    parts.push('Output ONLY a JSON object. No markdown fences.');

    return parts.join('\n');
  }

  parseResponse(response: string): Partial<AgentOutput> {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // If no JSON, treat as clear requirements
        return {
          files: [],
          artifacts: {
            needsClarification: false,
            requirements: { summary: response.slice(0, 200), features: [], data: [], integrations: [], constraints: [] },
          },
          issues: [],
        };
      }

      const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>;

      return {
        files: [],
        artifacts: {
          needsClarification: parsed.needsClarification ?? false,
          questions: parsed.questions ?? [],
          requirements: parsed.requirements ?? {},
        },
        issues: [],
      };
    } catch {
      return {
        files: [],
        artifacts: {
          needsClarification: false,
          requirements: { summary: 'Requirements parsing failed', features: [] },
        },
        issues: [],
      };
    }
  }
}
