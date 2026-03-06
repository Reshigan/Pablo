'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Github, Zap, Code2, GitBranch, Cpu, Rocket, Monitor } from 'lucide-react';
import { motion } from 'framer-motion';

/**
 * Task 42: Login page polish — animated gradient bg, framer-motion card entrance,
 * auto-typing tagline, feature icons, showcase link.
 */
export default function LoginPage() {
  const [devEmail, setDevEmail] = useState('dev@localhost');
  const [showDevLogin, setShowDevLogin] = useState(false);
  const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-pablo-bg overflow-hidden">
      {/* Task 42: Slow-moving gradient background */}
      <div className="pointer-events-none fixed inset-0">
        <div className="absolute inset-0 animate-pulse" style={{ animationDuration: '8s' }}>
          <div className="absolute left-[20%] top-[20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(212,168,67,0.06)_0%,transparent_70%)]" />
          <div className="absolute right-[20%] bottom-[20%] h-[500px] w-[500px] rounded-full bg-[radial-gradient(circle,rgba(59,130,246,0.04)_0%,transparent_70%)]" />
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        className="relative z-10 flex w-full max-w-md flex-col items-center gap-8 px-6"
      >
        {/* Logo */}
        <div className="flex flex-col items-center gap-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-pablo-gold/10 border border-pablo-gold/20 shadow-glow">
            <Zap size={32} className="text-pablo-gold" />
          </div>
          <h1 className="font-ui text-3xl font-bold tracking-tight text-pablo-text">
            Pablo
          </h1>
          <p className="font-ui text-sm text-pablo-gold/80 font-medium">
            Build SaaS in minutes, not months
          </p>
          <p className="font-ui text-xs text-pablo-text-muted text-center max-w-xs">
            AI-Powered IDE with a 9-stage pipeline that plans, builds, tests, audits &amp; deploys your full-stack app.
          </p>
        </div>

        {/* Login card */}
        <div className="w-full rounded-xl border border-pablo-border bg-pablo-surface-1 p-6 shadow-panel">
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

          {/* Dev Login — only visible on localhost */}
          {isLocalhost && (
            <div className="mt-3">
              {!showDevLogin ? (
                <button
                  onClick={() => setShowDevLogin(true)}
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-pablo-border bg-pablo-surface-2 px-4 py-2.5 font-ui text-xs font-medium text-pablo-text-muted transition-colors hover:border-pablo-gold/30 hover:text-pablo-text"
                >
                  <Monitor size={14} />
                  Dev Login (localhost only)
                </button>
              ) : (
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    signIn('dev-login', { email: devEmail, callbackUrl: '/session/new' });
                  }}
                  className="flex flex-col gap-2"
                >
                  <input
                    type="email"
                    value={devEmail}
                    onChange={(e) => setDevEmail(e.target.value)}
                    placeholder="dev@localhost"
                    className="w-full rounded-lg border border-pablo-border bg-pablo-surface-2 px-3 py-2 font-ui text-sm text-pablo-text placeholder:text-pablo-text-muted focus:border-pablo-gold/50 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="flex w-full items-center justify-center gap-2 rounded-lg border border-pablo-gold/30 bg-pablo-gold/10 px-4 py-2.5 font-ui text-xs font-medium text-pablo-gold transition-colors hover:bg-pablo-gold/20"
                  >
                    <Monitor size={14} />
                    Sign in as Dev User
                  </button>
                </form>
              )}
            </div>
          )}

          <div className="mt-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-pablo-border" />
            <span className="font-ui text-[10px] uppercase tracking-widest text-pablo-text-muted">
              Features
            </span>
            <div className="h-px flex-1 bg-pablo-border" />
          </div>

          <ul className="mt-4 space-y-2.5">
            {[
              { icon: GitBranch, text: 'Access your GitHub repositories directly in the IDE' },
              { icon: Cpu, text: '9-stage Feature Factory pipeline with enterprise audit' },
              { icon: Code2, text: 'Monaco editor with AI-assisted code generation' },
              { icon: Rocket, text: 'One-click deploy to Cloudflare Pages' },
            ].map(({ icon: Icon, text }) => (
              <li key={text} className="flex items-start gap-2.5">
                <Icon size={14} className="mt-0.5 shrink-0 text-pablo-gold/60" />
                <span className="font-ui text-xs text-pablo-text-dim">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="font-ui text-[10px] text-pablo-text-muted">
          By signing in, you agree to grant Pablo read access to your repositories.
        </p>
      </motion.div>
    </div>
  );
}
