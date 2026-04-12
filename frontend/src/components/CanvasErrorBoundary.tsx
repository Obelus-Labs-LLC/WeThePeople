import React, { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallbackHeight?: string;
}

interface State {
  hasError: boolean;
}

/**
 * Granular ErrorBoundary for canvas/WebGL components.
 * Catches rendering failures (GPU context loss, driver issues, etc.)
 * without bringing down the entire page.
 */
class CanvasErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="flex items-center justify-center rounded-xl border border-zinc-700/50 bg-zinc-900/50"
          style={{ minHeight: this.props.fallbackHeight || "300px" }}
        >
          <div className="text-center px-6">
            <p className="text-zinc-400 text-sm mb-3">
              Visualization failed to render
            </p>
            <button
              onClick={() => this.setState({ hasError: false })}
              className="rounded-lg bg-zinc-800 border border-zinc-700 px-4 py-2 text-xs font-medium text-zinc-300 hover:bg-zinc-700 transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

export default CanvasErrorBoundary;
