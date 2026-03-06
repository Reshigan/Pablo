// lib/domain-kb/kbInit.ts — Parse static KB files into domain entries
// Imported by loader.ts to populate the runtime KB

import { KB_FILES } from './staticKB';
import type { DomainEntry } from './loader';

/** Priority map: file id -> priority level */
const priorityMap: Record<string, DomainEntry['priority']> = {
  '01-architecture-patterns': 'critical',
  '02-frontend-patterns': 'high',
  '03-backend-patterns': 'high',
  '04-database-patterns': 'high',
  '05-devops-cicd': 'medium',
  '06-ai-ml-patterns': 'medium',
  '07-domain-knowledge': 'medium',
  '08-security-patterns': 'critical',
  '09-mobile-patterns': 'low',
  '10-testing-patterns': 'high',
  '11-repo-specific-learnings': 'medium',
  '12-common-pitfalls': 'high',
  '13-south-african-business': 'low',
  '14-enterprise-patterns': 'high',
};

/** Parse a KB markdown file into sections split by ## headings */
function parseKBFile(
  fileId: string,
  content: string,
  priority: DomainEntry['priority'],
): DomainEntry[] {
  const entries: DomainEntry[] = [];
  const sections = content.split(/^## /m).filter(Boolean);

  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const firstNewline = section.indexOf('\n');
    const title = firstNewline > -1 ? section.slice(0, firstNewline).trim() : section.trim();
    const body = firstNewline > -1 ? section.slice(firstNewline + 1).trim() : '';

    if (!title || body.length < 20) continue; // Skip empty or trivial sections

    // Extract code patterns from code blocks
    const codeMatch = body.match(/```[\w]*\n([\s\S]*?)```/);
    const codePattern = codeMatch ? codeMatch[1].trim() : '';

    // Derive category from file id
    const category = fileId.replace(/^\d+-/, '').replace(/-/g, ' ');

    entries.push({
      id: `${fileId}-${i}`,
      category,
      title,
      priority,
      content: body.slice(0, 3000), // Cap content size for prompt injection
      code_pattern: codePattern.slice(0, 1500),
    });
  }

  return entries;
}

/** All parsed KB entries — ready to inject into domainKB.entries */
export const ALL_KB_ENTRIES: DomainEntry[] = [];

/** Keyword to domain ID mapping for relevance matching */
export const KEYWORD_MAP: Record<string, string[]> = {
  // South African business
  'popia': ['13-south-african-business'],
  'bbbee': ['13-south-african-business'],
  'b-bbee': ['13-south-african-business'],
  'vat': ['13-south-african-business'],
  'south africa': ['13-south-african-business'],
  'za': ['13-south-african-business'],
  'rand': ['13-south-african-business'],
  'sars': ['13-south-african-business'],
  // Security
  'security': ['08-security-patterns'],
  'auth': ['08-security-patterns'],
  'jwt': ['08-security-patterns'],
  'oauth': ['08-security-patterns'],
  'encryption': ['08-security-patterns'],
  // Architecture
  'microservice': ['01-architecture-patterns'],
  'architecture': ['01-architecture-patterns'],
  'design pattern': ['01-architecture-patterns'],
  'clean architecture': ['01-architecture-patterns'],
  // Frontend
  'react': ['02-frontend-patterns'],
  'next.js': ['02-frontend-patterns'],
  'nextjs': ['02-frontend-patterns'],
  'tailwind': ['02-frontend-patterns'],
  'component': ['02-frontend-patterns'],
  // Backend
  'api': ['03-backend-patterns'],
  'fastapi': ['03-backend-patterns'],
  'express': ['03-backend-patterns'],
  'rest': ['03-backend-patterns'],
  'graphql': ['03-backend-patterns'],
  // Database
  'database': ['04-database-patterns'],
  'sql': ['04-database-patterns'],
  'postgres': ['04-database-patterns'],
  'migration': ['04-database-patterns'],
  'schema': ['04-database-patterns'],
  // DevOps
  'docker': ['05-devops-cicd'],
  'ci/cd': ['05-devops-cicd'],
  'deploy': ['05-devops-cicd'],
  'kubernetes': ['05-devops-cicd'],
  // AI/ML
  'machine learning': ['06-ai-ml-patterns'],
  'ml': ['06-ai-ml-patterns'],
  'model': ['06-ai-ml-patterns'],
  // Testing
  'test': ['10-testing-patterns'],
  'testing': ['10-testing-patterns'],
  'jest': ['10-testing-patterns'],
  'vitest': ['10-testing-patterns'],
  // Enterprise
  'enterprise': ['14-enterprise-patterns'],
  'erp': ['14-enterprise-patterns'],
  'compliance': ['14-enterprise-patterns'],
  'audit': ['14-enterprise-patterns'],
  // Mobile
  'mobile': ['09-mobile-patterns'],
  'ios': ['09-mobile-patterns'],
  'android': ['09-mobile-patterns'],
  'react native': ['09-mobile-patterns'],
};

// Parse all KB files on module load
for (const file of KB_FILES) {
  const priority = priorityMap[file.id] || 'medium';
  const entries = parseKBFile(file.id, file.content, priority);
  ALL_KB_ENTRIES.push(...entries);
}
