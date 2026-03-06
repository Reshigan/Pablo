/**
 * FeedbackLearner — Closes the learning loop
 *
 * Triggers:
 * 1. User accepts generated code (implicit positive feedback)
 * 2. User clicks thumbs-up/thumbs-down on a pipeline stage output
 * 3. Iteration loop fixes an issue (learn the fix pattern)
 * 4. Verification loop fixes a build error (learn the error→fix pair)
 * 5. User manually edits generated code (learn the correction)
 *
 * Actions:
 * - Positive: increase confidence of patterns used in that generation
 * - Negative: decrease confidence, extract what went wrong
 * - Fix: create a new pattern "When [error type] → Apply [fix approach]"
 * - Edit: create a correction pattern "User prefers [their approach] over [generated approach]"
 */

import { savePatterns, extractPatterns, type LearnedPattern } from './memorySystem';

export interface FeedbackEvent {
  type: 'accept' | 'reject' | 'fix' | 'edit' | 'thumbs_up' | 'thumbs_down';
  sessionId: string;
  /** The user's original request */
  userMessage: string;
  /** The generated code that feedback applies to */
  generatedCode: string;
  /** For 'fix': the error that was fixed */
  errorBefore?: string;
  /** For 'fix': the corrected code */
  fixedCode?: string;
  /** For 'edit': the user's corrected version */
  editedCode?: string;
  /** Language of the code */
  language: string;
}

export async function processFeedback(event: FeedbackEvent): Promise<void> {
  const patterns: LearnedPattern[] = [];
  const now = Date.now();

  switch (event.type) {
    case 'accept':
    case 'thumbs_up': {
      // Reinforce existing patterns — the code was good
      // Extract what made it good and save as high-confidence pattern
      const extracted = extractPatterns(event.userMessage, event.generatedCode, event.language);
      // Boost confidence for accepted code
      for (const p of extracted) {
        p.confidence = Math.min(p.confidence + 0.15, 1.0);
      }
      patterns.push(...extracted);
      break;
    }

    case 'reject':
    case 'thumbs_down': {
      // Anti-pattern: decrease confidence for patterns matching this generation
      // Also create a "what NOT to do" entry
      patterns.push({
        id: `anti-${now}-${Math.random().toString(36).slice(2, 8)}`,
        trigger: `User rejected output for: ${event.userMessage.slice(0, 100)}`,
        action: `AVOID: the approach used in the rejected code (${event.language})`,
        confidence: 0.3,
        domain: 'general',
        language: event.language,
        createdAt: now,
        lastUsedAt: now,
        useCount: 1,
      });
      break;
    }

    case 'fix': {
      // Learn error→fix pair
      if (event.errorBefore && event.fixedCode) {
        // Extract the error type
        const errorType = classifyError(event.errorBefore);
        const fixApproach = describeFix(event.errorBefore, event.fixedCode);
        patterns.push({
          id: `fix-${now}-${Math.random().toString(36).slice(2, 8)}`,
          trigger: `Build/test error: ${errorType}`,
          action: `Fix approach: ${fixApproach}`,
          confidence: 0.8, // Fixes are high-confidence — they solved a real problem
          domain: 'error-fix',
          language: event.language,
          createdAt: now,
          lastUsedAt: now,
          useCount: 1,
        });
      }
      break;
    }

    case 'edit': {
      // User corrected the code — learn their preference
      if (event.editedCode && event.generatedCode) {
        const diff = describeDifference(event.generatedCode, event.editedCode);
        if (diff) {
          patterns.push({
            id: `pref-${now}-${Math.random().toString(36).slice(2, 8)}`,
            trigger: `Code generation for: ${event.userMessage.slice(0, 80)}`,
            action: `User preference: ${diff}`,
            confidence: 0.85, // User explicitly made this change
            domain: 'preference',
            language: event.language,
            createdAt: now,
            lastUsedAt: now,
            useCount: 1,
          });
        }
      }
      break;
    }
  }

  if (patterns.length > 0) {
    await savePatterns(patterns);
  }

  // Also persist the feedback event to D1 for analytics
  try {
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const ctx = await getCloudflareContext({ async: true });
    const db = (ctx.env as Record<string, unknown>).DB as {
      prepare: (sql: string) => { bind: (...args: unknown[]) => { run: () => Promise<unknown> } };
    } | undefined;
    if (db) {
      await db.prepare(
        'INSERT INTO feedback_events (id, session_id, event_type, user_message, pattern_ids, created_at) VALUES (?, ?, ?, ?, ?, datetime(\'now\'))'
      ).bind(
        `fb-${now}-${Math.random().toString(36).slice(2, 8)}`,
        event.sessionId,
        event.type,
        event.userMessage.slice(0, 500),
        JSON.stringify(patterns.map(p => p.id)),
      ).run();
    }
  } catch {
    // Non-blocking — feedback event is still processed locally
  }
}

function classifyError(error: string): string {
  if (/TypeError|is not a function|undefined is not/.test(error)) return 'TypeError — accessing property of undefined';
  if (/SyntaxError|Unexpected token/.test(error)) return 'SyntaxError — invalid code syntax';
  if (/TS\d{4}/.test(error)) return 'TypeScript compile error';
  if (/Cannot find module|Module not found/.test(error)) return 'Missing import/module';
  if (/CORS|Access-Control/.test(error)) return 'CORS configuration error';
  if (/401|403|Unauthorized/.test(error)) return 'Authentication/authorization error';
  if (/ECONNREFUSED|fetch failed/.test(error)) return 'Network/connection error';
  return error.slice(0, 100);
}

function describeFix(errorBefore: string, fixedCode: string): string {
  // Simple heuristic — in practice the LLM would generate this
  if (fixedCode.includes('try') && !errorBefore.includes('try')) return 'Added try/catch error handling';
  if (fixedCode.includes('?.') || fixedCode.includes('?.[')) return 'Added optional chaining for null safety';
  if (fixedCode.includes('import ') && /Cannot find module/.test(errorBefore)) return 'Added missing import statement';
  if (fixedCode.includes('cors') || fixedCode.includes('CORS')) return 'Fixed CORS configuration';
  return 'Applied targeted fix for the error';
}

function describeDifference(original: string, edited: string): string | null {
  const origLines = original.split('\n').length;
  const editLines = edited.split('\n').length;
  if (Math.abs(origLines - editLines) < 3 && original.length === edited.length) return null;
  if (edited.includes('async') && !original.includes('async')) return 'Converted to async/await pattern';
  if (edited.includes('try') && !original.includes('try')) return 'Added error handling';
  if (edited.split('\n').length < original.split('\n').length * 0.7) return 'Simplified/condensed the code';
  return `User modified ${Math.abs(origLines - editLines)} lines`;
}
