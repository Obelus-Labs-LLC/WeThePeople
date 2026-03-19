import React, { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error?: Error;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: any) {
    // Optionally log error
    // console.error(error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="bg-red-900/20 border border-red-500/40 text-red-300 p-6 rounded-xl mt-4">
          <h2 className="font-bold text-lg mb-2">Something went wrong.</h2>
          <div className="mb-4">{this.state.error?.message}</div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => window.location.reload()}
              className="rounded-lg bg-red-500/20 border border-red-500/30 px-4 py-2 text-sm font-medium text-red-300 hover:bg-red-500/30 transition-colors"
            >
              Reload Page
            </button>
            <a
              href="/"
              className="rounded-lg bg-white/5 border border-white/10 px-4 py-2 text-sm font-medium text-white/70 hover:bg-white/10 transition-colors no-underline"
            >
              Return to Home
            </a>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
