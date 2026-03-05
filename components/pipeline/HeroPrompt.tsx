'use client';

/**
 * HeroPrompt — Empty state for new sessions with template quick-start buttons.
 * Shown in PipelineView when no pipeline runs exist yet (Task 31).
 */

import { Sparkles, Globe, ShoppingCart, BarChart3, MessageSquare, Cpu } from 'lucide-react';

interface TemplateOption {
  label: string;
  icon: React.ReactNode;
  prompt: string;
}

const TEMPLATES: TemplateOption[] = [
  {
    label: 'Landing Page',
    icon: <Globe size={16} />,
    prompt: 'Build a modern responsive landing page with hero section, features grid, testimonials, pricing table, and contact form using React and Tailwind CSS',
  },
  {
    label: 'E-Commerce Store',
    icon: <ShoppingCart size={16} />,
    prompt: 'Build a full e-commerce storefront with product catalog, cart, checkout flow, and order confirmation using React, Tailwind, and local state management',
  },
  {
    label: 'Dashboard App',
    icon: <BarChart3 size={16} />,
    prompt: 'Build an analytics dashboard with charts, data tables, filters, and a sidebar navigation using React, Tailwind, and Recharts',
  },
  {
    label: 'Chat Interface',
    icon: <MessageSquare size={16} />,
    prompt: 'Build a real-time chat application with message bubbles, typing indicators, user avatars, and a message input area using React and Tailwind CSS',
  },
  {
    label: 'AI Tool',
    icon: <Cpu size={16} />,
    prompt: 'Build an AI-powered text analysis tool with input area, processing animation, results display with sentiment analysis and key phrase extraction',
  },
];

interface HeroPromptProps {
  onSelectTemplate: (prompt: string) => void;
}

export function HeroPrompt({ onSelectTemplate }: HeroPromptProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-6 px-6 py-12 text-center">
      {/* Logo / hero */}
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold/10 ring-1 ring-pablo-gold/20">
        <Sparkles size={32} className="text-pablo-gold" />
      </div>

      <div className="max-w-md">
        <h2 className="font-ui text-lg font-bold text-pablo-text">
          What would you like to build?
        </h2>
        <p className="mt-2 font-ui text-sm text-pablo-text-muted">
          Describe your app and Pablo will generate a complete, production-ready codebase
          through an 8-stage AI pipeline.
        </p>
      </div>

      {/* Template quick-start buttons */}
      <div className="grid w-full max-w-lg grid-cols-2 gap-2 sm:grid-cols-3">
        {TEMPLATES.map((template) => (
          <button
            key={template.label}
            onClick={() => onSelectTemplate(template.prompt)}
            className="flex items-center gap-2 rounded-lg border border-pablo-border bg-pablo-panel px-3 py-2.5 text-left transition-all hover:border-pablo-gold/30 hover:bg-pablo-hover group"
          >
            <span className="shrink-0 text-pablo-text-muted group-hover:text-pablo-gold transition-colors">
              {template.icon}
            </span>
            <span className="font-ui text-xs font-medium text-pablo-text-dim group-hover:text-pablo-text transition-colors">
              {template.label}
            </span>
          </button>
        ))}
      </div>

      <p className="font-ui text-[10px] text-pablo-text-muted">
        Or type your own description in the input below
      </p>
    </div>
  );
}
