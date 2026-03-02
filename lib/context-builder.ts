/**
 * Context Builder - Assembles rich context for LLM prompts
 * 
 * Combines: file content, learned patterns, domain knowledge,
 * conversation history, and project structure into a single context string.
 */

export interface ContextSource {
  type: 'file' | 'pattern' | 'domain_kb' | 'conversation' | 'project_structure';
  content: string;
  relevance: number; // 0-1
  tokenEstimate: number;
}

export interface ContextConfig {
  maxTokens: number;
  includePatterns: boolean;
  includeDomainKB: boolean;
  includeConversation: boolean;
  includeProjectStructure: boolean;
  priorityOrder: ContextSource['type'][];
}

const DEFAULT_CONFIG: ContextConfig = {
  maxTokens: 4096,
  includePatterns: true,
  includeDomainKB: true,
  includeConversation: true,
  includeProjectStructure: true,
  priorityOrder: ['conversation', 'file', 'pattern', 'domain_kb', 'project_structure'],
};

/**
 * Estimate token count from text (rough approximation: ~4 chars per token)
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Build context from multiple sources, respecting token limits
 */
export function buildContext(
  sources: ContextSource[],
  config: Partial<ContextConfig> = {}
): string {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Filter sources based on config
  const filteredSources = sources.filter((s) => {
    if (s.type === 'pattern' && !cfg.includePatterns) return false;
    if (s.type === 'domain_kb' && !cfg.includeDomainKB) return false;
    if (s.type === 'conversation' && !cfg.includeConversation) return false;
    if (s.type === 'project_structure' && !cfg.includeProjectStructure) return false;
    return true;
  });

  // Sort by priority order, then by relevance within same type
  const sorted = [...filteredSources].sort((a, b) => {
    const aIdx = cfg.priorityOrder.indexOf(a.type);
    const bIdx = cfg.priorityOrder.indexOf(b.type);
    if (aIdx !== bIdx) return aIdx - bIdx;
    return b.relevance - a.relevance;
  });

  // Assemble context within token budget
  const parts: string[] = [];
  let totalTokens = 0;

  for (const source of sorted) {
    if (totalTokens + source.tokenEstimate > cfg.maxTokens) {
      // Try to include a truncated version
      const remainingTokens = cfg.maxTokens - totalTokens;
      if (remainingTokens > 100) {
        const truncatedChars = remainingTokens * 4;
        parts.push(source.content.slice(0, truncatedChars) + '\n... (truncated)');
        totalTokens += remainingTokens;
      }
      break;
    }

    parts.push(source.content);
    totalTokens += source.tokenEstimate;
  }

  return parts.join('\n\n---\n\n');
}

/**
 * Create a file context source
 */
export function fileSource(path: string, content: string, relevance: number = 0.8): ContextSource {
  const formatted = `## File: ${path}\n\`\`\`\n${content}\n\`\`\``;
  return {
    type: 'file',
    content: formatted,
    relevance,
    tokenEstimate: estimateTokens(formatted),
  };
}

/**
 * Create a pattern context source
 */
export function patternSource(patterns: Array<{ trigger: string; action: string; confidence: number }>): ContextSource {
  if (patterns.length === 0) {
    return { type: 'pattern', content: '', relevance: 0, tokenEstimate: 0 };
  }

  const lines = patterns.map(
    (p) => `- When: "${p.trigger}" → Do: "${p.action}" (${Math.round(p.confidence * 100)}% confident)`
  );
  const content = `## Learned Patterns\n${lines.join('\n')}`;
  return {
    type: 'pattern',
    content,
    relevance: Math.max(...patterns.map((p) => p.confidence)),
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Create a domain knowledge context source
 */
export function domainKBSource(entries: Array<{ domain: string; key: string; value: string }>): ContextSource {
  if (entries.length === 0) {
    return { type: 'domain_kb', content: '', relevance: 0, tokenEstimate: 0 };
  }

  const lines = entries.map((e) => `- **${e.domain}/${e.key}**: ${e.value}`);
  const content = `## Domain Knowledge\n${lines.join('\n')}`;
  return {
    type: 'domain_kb',
    content,
    relevance: 0.7,
    tokenEstimate: estimateTokens(content),
  };
}

/**
 * Create a conversation history context source
 */
export function conversationSource(
  messages: Array<{ role: string; content: string }>,
  maxMessages: number = 10
): ContextSource {
  const recent = messages.slice(-maxMessages);
  if (recent.length === 0) {
    return { type: 'conversation', content: '', relevance: 0, tokenEstimate: 0 };
  }

  const lines = recent.map((m) => `**${m.role}**: ${m.content}`);
  const content = `## Conversation History\n${lines.join('\n\n')}`;
  return {
    type: 'conversation',
    content,
    relevance: 1.0,
    tokenEstimate: estimateTokens(content),
  };
}
