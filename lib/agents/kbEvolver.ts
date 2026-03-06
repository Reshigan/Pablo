/**
 * KBEvolver — Phase 2 stub
 *
 * Future: Auto-expand the domain knowledge base from successful generations.
 * - After a pipeline completes with score >= 90, extract architecture patterns
 * - Add them to the KB so future generations benefit
 * - Deduplicate with existing KB entries
 *
 * Phase 2 implementation will:
 * 1. Parse successful pipeline outputs for reusable patterns
 * 2. Classify patterns by domain (auth, database, UI, etc.)
 * 3. Store in D1 domain_kb table with source = 'auto-extracted'
 * 4. Surface in the KB panel for admin review
 */

export interface KBExpansion {
  id: string;
  category: string;
  title: string;
  content: string;
  source: 'auto-extracted' | 'user-contributed' | 'review-feedback';
  confidence: number;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
}

/**
 * Extract KB entries from a successful pipeline output (Phase 2 stub — no-op).
 */
export async function extractKBFromOutput(
  _files: Array<{ path: string; content: string; language: string }>,
  _score: number,
): Promise<KBExpansion[]> {
  // Phase 2: will parse files for architecture patterns
  return [];
}

/**
 * Get pending KB expansions for admin review (Phase 2 stub — returns empty).
 */
export async function getPendingExpansions(): Promise<KBExpansion[]> {
  // Phase 2: will query D1 for pending expansions
  return [];
}
