// lib/domain-kb/loader.ts
// Loads domain knowledge and system prompt for context injection
// Supports selectable domain packs (opt-in, locale-neutral by default)

import { ALL_KB_ENTRIES, KEYWORD_MAP } from './kbInit';

// Populated from static KB at module load + any runtime domain packs
const domainKB: { entries: DomainEntry[] } = { entries: [] };

// Auto-register all static KB entries on module load
for (const entry of ALL_KB_ENTRIES) {
  domainKB.entries.push(entry);
}

// Available domain packs (registered at build time)
interface DomainPack {
  id: string;
  name: string;
  description: string;
  locale: string;
  entries: DomainEntry[];
}

const registeredPacks: Map<string, DomainPack> = new Map();

// Active packs (selected by the user at runtime)
let activePacks: Set<string> = new Set();

/**
 * Register a domain pack (call at app init or from settings)
 */
export function registerDomainPack(pack: DomainPack): void {
  registeredPacks.set(pack.id, pack);
}

/**
 * List all available domain packs
 */
export function listDomainPacks(): Array<{ id: string; name: string; description: string; locale: string; active: boolean }> {
  return Array.from(registeredPacks.values()).map(p => ({
    id: p.id,
    name: p.name,
    description: p.description,
    locale: p.locale,
    active: activePacks.has(p.id),
  }));
}

/**
 * Enable a domain pack — its entries become part of the active KB
 */
export function enableDomainPack(packId: string): boolean {
  const pack = registeredPacks.get(packId);
  if (!pack) return false;
  activePacks.add(packId);
  // Merge entries into active KB (avoid duplicates by id)
  const existingIds = new Set(domainKB.entries.map(e => e.id));
  for (const entry of pack.entries) {
    if (!existingIds.has(entry.id)) {
      domainKB.entries.push(entry);
    }
  }
  return true;
}

/**
 * Disable a domain pack — remove its entries from the active KB
 */
export function disableDomainPack(packId: string): boolean {
  if (!activePacks.has(packId)) return false;
  const pack = registeredPacks.get(packId);
  if (!pack) return false;
  activePacks.delete(packId);
  const packEntryIds = new Set(pack.entries.map(e => e.id));
  domainKB.entries = domainKB.entries.filter(e => !packEntryIds.has(e.id));
  return true;
}

/**
 * Get active pack IDs (for persistence in settings)
 */
export function getActivePacks(): string[] {
  return Array.from(activePacks);
}

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

  // Keyword to domain ID mapping (populated from kbInit)
  const keywordMap = KEYWORD_MAP;

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

  return `\n\n## DOMAIN KNOWLEDGE\n\n${sections.join('\n\n---\n\n')}`;
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
