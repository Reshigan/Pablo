'use client';

/**
 * StreamingIndicator — Pulsing cursor shown while assistant is streaming.
 * Extracted from ChatPanel.tsx (Task 29).
 */

export function StreamingIndicator() {
  return (
    <span className="inline-block h-3 w-1.5 animate-pulse-gold bg-pablo-gold ml-0.5" />
  );
}
