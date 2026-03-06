// lib/agents/specialists/designAgent.ts
// Design system: Tailwind config, design tokens, color palette

import { BaseAgent, type AgentInput, type AgentOutput } from './baseAgent';

const SYSTEM_PROMPT = `You are the Design Agent — a senior UI/UX designer who creates design systems.

PRODUCES:
- tailwind.config.ts with custom theme tokens (colors, spacing, typography, borderRadius)
- src/styles/tokens.ts — exported design constants for use in components

OUTPUT FORMAT — respond with BOTH:
1. A JSON design tokens object
2. File contents for tailwind.config.ts and tokens.ts

JSON tokens format:
{
  "designTokens": {
    "colors": { "primary": "#3B82F6", "secondary": "#10B981", "error": "#EF4444", "warning": "#F59E0B", "success": "#10B981", "background": "#0F172A", "surface": "#1E293B", "text": "#F8FAFC" },
    "spacing": { "xs": "0.25rem", "sm": "0.5rem", "md": "1rem", "lg": "1.5rem", "xl": "2rem" },
    "typography": { "fontFamily": "Inter, system-ui, sans-serif", "headingSize": "1.5rem", "bodySize": "1rem" },
    "borderRadius": { "sm": "0.25rem", "md": "0.5rem", "lg": "1rem", "full": "9999px" }
  }
}

RULES:
- Modern, professional color palette with good contrast ratios (WCAG AA)
- Dark mode as default (common for dev tools and IDE)
- Consistent spacing scale
- System font stack with web-safe fallbacks
- Mobile-first responsive breakpoints`;

export class DesignAgent extends BaseAgent {
  constructor() {
    super({
      name: 'DesignAgent',
      role: 'UI/UX Designer',
      systemPrompt: SYSTEM_PROMPT,
      model: {
        provider: 'ollama_cloud',
        model: 'gpt-oss:20b',
        description: 'Qwen2.5 72B for design token generation',
        max_tokens: 8192,
        temperature: 0.3,
        estimated_speed: '30-60 TPS',
      },
      fileScope: [
        /^tailwind\.config/,
        /^src\/styles\//,
        /^styles\//,
      ],
      maxOutputTokens: 8192,
      temperature: 0.3,
    });
  }

  buildPrompt(input: AgentInput): string {
    const parts: string[] = [];

    parts.push(`USER REQUEST: ${input.userMessage}`);
    parts.push('\nGenerate design tokens as JSON and Tailwind config files. Include both the JSON tokens and the file contents.');

    return parts.join('\n');
  }

  parseResponse(response: string): Partial<AgentOutput> {
    const base = super.parseResponse(response);

    // Try to extract design tokens JSON
    try {
      const jsonMatch = response.match(/\{[\s\S]*"designTokens"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as { designTokens?: Record<string, unknown> };
        return {
          ...base,
          artifacts: {
            designTokens: parsed.designTokens ?? {},
          },
        };
      }
    } catch {
      // Fall through to default
    }

    return {
      ...base,
      artifacts: {
        designTokens: {
          colors: { primary: '#3B82F6', secondary: '#10B981', error: '#EF4444' },
          spacing: { xs: '0.25rem', sm: '0.5rem', md: '1rem', lg: '1.5rem' },
          typography: { fontFamily: 'Inter, system-ui, sans-serif' },
          borderRadius: { sm: '0.25rem', md: '0.5rem', lg: '1rem' },
        },
      },
    };
  }
}
