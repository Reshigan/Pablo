'use client';

import { Component, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error Boundary — catches render errors in child components
 * and displays a fallback UI instead of crashing the whole app.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary${this.props.name ? `:${this.props.name}` : ''}]`, error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center gap-3 p-6 text-center">
          <div className="rounded-lg border border-red-500/20 bg-red-500/5 px-4 py-3">
            <h3 className="font-ui text-sm font-semibold text-red-400">
              Something went wrong{this.props.name ? ` in ${this.props.name}` : ''}
            </h3>
            <p className="mt-1 font-code text-xs text-red-400/70">
              {this.state.error?.message ?? 'Unknown error'}
            </p>
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            className="rounded-md bg-pablo-gold/10 px-3 py-1.5 font-ui text-xs text-pablo-gold transition-colors hover:bg-pablo-gold/20"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
