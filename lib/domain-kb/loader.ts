// lib/domain-kb/loader.ts
// Loads domain knowledge and system prompt for context injection

import domainKB from './south-african-enterprise.json';

export interface DomainEntry {
  id: string;
  category: string;
  title: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  content: string;
  code_pattern: string;
}

// Get domain entries by priority
export function getDomainKnowledge(minPriority: 'critical' | 'high' | 'medium' | 'low' = 'medium'): DomainEntry[] {
  const priorityRank: Record<string, number> = { critical: 4, high: 3, medium: 2, low: 1 };
  const minRank = priorityRank[minPriority];
  const entries = (domainKB as { entries: DomainEntry[] }).entries;
  return entries.filter(e => priorityRank[e.priority] >= minRank);
}

// Get relevant domain entries based on user message keywords
export function getRelevantKnowledge(userMessage: string): DomainEntry[] {
  const msg = userMessage.toLowerCase();
  const allEntries = (domainKB as { entries: DomainEntry[] }).entries;

  // Keyword to domain ID mapping
  const keywordMap: Record<string, string[]> = {
    'vat': ['sa_vat'],
    'tax': ['sa_vat'],
    'currency': ['sa_currency'],
    'rand': ['sa_currency'],
    'zar': ['sa_currency'],
    'bbbee': ['sa_bbbee'],
    'b-bbee': ['sa_bbbee'],
    'bee': ['sa_bbbee'],
    'popia': ['sa_popia'],
    'privacy': ['sa_popia'],
    'consent': ['sa_popia'],
    'auth': ['sa_auth_security'],
    'login': ['sa_auth_security'],
    'password': ['sa_auth_security'],
    'jwt': ['sa_auth_security'],
    'security': ['sa_auth_security'],
    'fastapi': ['sa_fastapi_patterns'],
    'api': ['sa_fastapi_patterns'],
    'backend': ['sa_fastapi_patterns'],
    'seed': ['sa_seed_data'],
    'demo': ['sa_seed_data'],
    'test data': ['sa_seed_data'],
    'pipeline': ['sa_sales_pipeline'],
    'deal': ['sa_sales_pipeline'],
    'commission': ['sa_sales_pipeline'],
    'sales': ['sa_sales_pipeline', 'sa_seed_data', 'sa_vat', 'sa_currency'],
    'payment': ['sa_banking_apis'],
    'payfast': ['sa_banking_apis'],
    'bank': ['sa_banking_apis'],
    'solar': ['sa_solar_energy'],
    'energy': ['sa_solar_energy'],
    'ppa': ['sa_solar_energy'],
    'sap': ['sa_sap_patterns'],
    'bapi': ['sa_sap_patterns'],
    'erp': ['sa_sap_patterns'],
  };

  const relevantIds = new Set<string>();

  // Always include critical entries for code generation
  allEntries.filter(e => e.priority === 'critical').forEach(e => relevantIds.add(e.id));

  // Match keywords
  for (const [keyword, ids] of Object.entries(keywordMap)) {
    if (msg.includes(keyword)) {
      ids.forEach(id => relevantIds.add(id));
    }
  }

  // For feature generation, include all high-priority entries
  const featurePatterns = /build|create|generate|implement|system|app|backend|frontend/i;
  if (featurePatterns.test(msg)) {
    allEntries.filter(e => e.priority === 'high').forEach(e => relevantIds.add(e.id));
  }

  return allEntries.filter(e => relevantIds.has(e.id));
}

// Format domain knowledge for injection into system prompt
export function formatDomainKnowledge(entries: DomainEntry[]): string {
  if (entries.length === 0) return '';

  const sections = entries.map(e => {
    let section = `### ${e.title} [${e.priority.toUpperCase()}]\n${e.content}`;
    if (e.code_pattern) {
      section += `\n\nReference implementation:\n\`\`\`python\n${e.code_pattern}\n\`\`\``;
    }
    return section;
  });

  return `\n\n## DOMAIN KNOWLEDGE (South African Enterprise)\n\n${sections.join('\n\n---\n\n')}`;
}

// Format learned patterns for injection into system prompt
function formatPatterns(patterns: Array<{ trigger: string; action: string; confidence: number }>): string {
  if (patterns.length === 0) return '';
  const lines = patterns
    .filter(p => p.confidence >= 0.4)
    .map(p => `- When: "${p.trigger}" → Do: "${p.action}" (${Math.round(p.confidence * 100)}% confident)`);
  if (lines.length === 0) return '';
  return `\n\n## LEARNED PATTERNS\n${lines.join('\n')}`;
}

// Format codebase file context for injection into system prompt
function formatCodebaseContext(files: Array<{ path: string; content: string; language: string }>): string {
  if (files.length === 0) return '';
  const sections = files.slice(0, 5).map(f => `### ${f.path}\n\`\`\`${f.language}\n${f.content.slice(0, 2000)}\n\`\`\``);
  return `\n\n## CODEBASE CONTEXT (open files)\n${sections.join('\n\n')}`;
}

// Load and build the master system prompt with domain knowledge injected
export function buildSystemPrompt(
  userMessage: string,
  basePrompt: string,
  patterns?: Array<{ trigger: string; action: string; confidence: number }>,
  openFiles?: Array<{ path: string; content: string; language: string }>
): string {
  const relevantKB = getRelevantKnowledge(userMessage);
  const formattedKB = formatDomainKnowledge(relevantKB);

  // Replace placeholders in base prompt
  let prompt = basePrompt;
  prompt = prompt.replace('{domain_knowledge}', () => formattedKB);
  prompt = prompt.replace('{patterns}', () => formatPatterns(patterns ?? []));
  prompt = prompt.replace('{codebase_context}', () => formatCodebaseContext(openFiles ?? []));

  return prompt;
}
