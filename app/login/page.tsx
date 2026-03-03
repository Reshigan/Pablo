'use client';

import { signIn } from 'next-auth/react';
import { Github, Zap } from 'lucide-react';

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-pablo-bg">
      {/* Background effects */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-96 w-96 rounded-full bg-pablo-gold/5 blur-3xl" />
        <div className="absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-pablo-gold/3 blur-3xl" />
      </div>

      <div className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 px-6">
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold-bg border border-pablo-gold/20">
            <Zap size={32} className="text-pablo-gold" />
          </div>
          <h1 className="font-ui text-3xl font-bold tracking-tight text-pablo-text">
            Pablo
          </h1>
          <p className="font-ui text-sm text-pablo-text-muted text-center">
            AI-Powered IDE with DeepSeek-R1 reasoning and Qwen3-Coder implementation
          </p>
        </div>

        {/* Login card */}
        <div className="w-full rounded-xl border border-pablo-border bg-pablo-panel p-6">
          <h2 className="mb-2 font-ui text-lg font-semibold text-pablo-text">
            Sign in to Pablo
          </h2>
          <p className="mb-6 font-ui text-sm text-pablo-text-muted">
            Connect your GitHub account to access your repositories and start building with AI.
          </p>

          <button
            onClick={() => signIn('github', { callbackUrl: '/session/new' })}
            className="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-ui text-sm font-medium text-gray-900 transition-all duration-150 hover:bg-gray-100 active:scale-[0.98]"
          >
            <Github size={20} />
            Continue with GitHub
          </button>

          <div className="mt-4 flex items-center gap-3">
            <div className="h-px flex-1 bg-pablo-border" />
            <span className="font-ui text-[10px] uppercase tracking-widest text-pablo-text-muted">
              Features
            </span>
            <div className="h-px flex-1 bg-pablo-border" />
          </div>

          <ul className="mt-4 space-y-2">
            {[
              'Access your GitHub repositories directly in the IDE',
              '8-stage Feature Factory pipeline with UX validation',
              'Monaco editor with AI-assisted code generation',
              'Real-time chat with DeepSeek-R1 and Qwen3-Coder',
            ].map((feature) => (
              <li key={feature} className="flex items-start gap-2">
                <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-pablo-gold" />
                <span className="font-ui text-xs text-pablo-text-dim">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-ui text-[10px] text-pablo-text-muted">
          By signing in, you agree to grant Pablo read access to your repositories.
        </p>
      </div>
    </div>
  );
}
