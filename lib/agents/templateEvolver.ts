/**
 * TemplateEvolver — Phase 2 stub
 *
 * Future: Suggest new project templates from usage patterns.
 * - Track which tech stacks users choose most often
 * - Identify common combinations (e.g. Next.js + Prisma + Tailwind)
 * - Auto-suggest new templates based on popular patterns
 *
 * Phase 2 implementation will:
 * 1. Listen to pipeline completions and extract tech stack info
 * 2. Cluster similar stacks and identify gaps in template coverage
 * 3. Generate template suggestions for admin review
 */

export interface TemplateSuggestion {
  id: string;
  name: string;
  description: string;
  techStack: string[];
  frequency: number;       // How often this stack was used
  confidence: number;      // How sure we are this is a good template
  status: 'suggested' | 'approved' | 'rejected';
  createdAt: number;
}

/**
 * Record a tech stack usage event (Phase 2 stub — no-op).
 */
export async function recordStackUsage(
  _techStack: string[],
  _featureDescription: string,
): Promise<void> {
  // Phase 2: will persist to D1 and cluster stacks
}

/**
 * Get template suggestions (Phase 2 stub — returns empty).
 */
export async function getTemplateSuggestions(): Promise<TemplateSuggestion[]> {
  // Phase 2: will query D1 for clustered stack patterns
  return [];
}
