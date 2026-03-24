import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import ErrorBoundary from '../../components/ErrorBoundary';

// A component that throws during render
function ThrowingComponent({ message }: { message: string }) {
  throw new Error(message);
}

// A component that renders normally
function GoodComponent() {
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  // Suppress console.error from React's error boundary logging
  const originalConsoleError = console.error;
  beforeEach(() => {
    console.error = vi.fn();
  });
  afterEach(() => {
    console.error = originalConsoleError;
  });

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>
    );
    expect(screen.getByText('All good')).toBeTruthy();
  });

  it('catches render errors and shows error UI', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Test explosion" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Something went wrong.')).toBeTruthy();
    expect(screen.getByText('Test explosion')).toBeTruthy();
  });

  it('shows a Reload Page button', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Kaboom" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Reload Page')).toBeTruthy();
  });

  it('shows a Return to Home link', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Kaboom" />
      </ErrorBoundary>
    );
    const homeLink = screen.getByText('Return to Home');
    expect(homeLink).toBeTruthy();
    expect(homeLink.closest('a')?.getAttribute('href')).toBe('/');
  });

  it('displays the error message text', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent message="Unique error message xyz" />
      </ErrorBoundary>
    );
    expect(screen.getByText('Unique error message xyz')).toBeTruthy();
  });
});
