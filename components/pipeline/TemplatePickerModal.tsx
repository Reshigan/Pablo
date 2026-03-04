'use client';

/**
 * Feature 12: Starter Templates
 * Template picker modal shown when starting a new project.
 */

import { X } from 'lucide-react';
import { useState, useCallback } from 'react';
import { TEMPLATES, type StarterTemplate } from '@/lib/templates';

interface TemplatePickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (prompt: string) => void;
}

export function TemplatePickerModal({ open, onClose, onSelect }: TemplatePickerModalProps) {
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const handleSelect = useCallback(
    (template: StarterTemplate) => {
      onSelect(template.prompt);
      onClose();
    },
    [onSelect, onClose]
  );

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-xl border border-pablo-border bg-pablo-panel shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-pablo-border px-5 py-3">
          <h2 className="font-ui text-sm font-semibold text-pablo-text">Start a new project</h2>
          <button
            onClick={onClose}
            className="flex h-6 w-6 items-center justify-center rounded text-pablo-text-muted transition-colors hover:bg-pablo-hover hover:text-pablo-text"
          >
            <X size={16} />
          </button>
        </div>

        {/* Template grid */}
        <div className="grid grid-cols-2 gap-3 p-5">
          {TEMPLATES.map((template) => (
            <button
              key={template.id}
              onClick={() => handleSelect(template)}
              onMouseEnter={() => setHoveredId(template.id)}
              onMouseLeave={() => setHoveredId(null)}
              className={`flex flex-col items-start rounded-lg border p-3 text-left transition-all ${
                hoveredId === template.id
                  ? 'border-pablo-gold bg-pablo-gold/5 shadow-lg'
                  : 'border-pablo-border bg-pablo-bg hover:border-pablo-gold/40'
              }`}
            >
              <span className="text-2xl">{template.icon}</span>
              <span className="mt-1 font-ui text-xs font-medium text-pablo-text">
                {template.name}
              </span>
              <span className="mt-0.5 font-ui text-[10px] text-pablo-text-muted leading-tight">
                {template.description}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {template.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-pablo-active px-1 font-code text-[9px] text-pablo-text-muted"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="border-t border-pablo-border px-5 py-3">
          <p className="font-ui text-[10px] text-pablo-text-muted text-center">
            Or type your own project description in the pipeline input
          </p>
        </div>
      </div>
    </div>
  );
}
