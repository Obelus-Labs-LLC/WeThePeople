import React from 'react';
import { Link } from 'react-router-dom';

/**
 * Shared layout for login, signup, and similar auth screens.
 *
 * Matches the design in `WTP Design - Legal, Utility & Auth.html`:
 *   - Centered column, max width 420px
 *   - "WTP" logo mark above the card
 *   - Card content passed via children
 *   - Optional footer node below the card (e.g. "Already have an account?")
 *
 * Fonts and colors are pulled from CSS custom properties so the shell adapts
 * to any theme updates without needing per-page tweaks.
 */
interface AuthShellProps {
  children: React.ReactNode;
  footer?: React.ReactNode;
}

export default function AuthShell({ children, footer }: AuthShellProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--color-bg)',
        color: 'var(--color-text-1)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 20px',
      }}
    >
      <div
        style={{
          width: 420,
          maxWidth: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        {/* Logo mark */}
        <Link
          to="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginBottom: 36,
            textDecoration: 'none',
          }}
        >
          <div
            style={{
              width: 36,
              height: 36,
              border: '1.5px solid var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: "'Playfair Display', Georgia, serif",
              fontStyle: 'italic',
              fontWeight: 700,
              fontSize: 11,
              color: 'var(--color-accent)',
            }}
          >
            WTP
          </div>
          <span
            style={{
              fontFamily: "'Inter', sans-serif",
              fontSize: 15,
              fontWeight: 600,
              color: 'var(--color-text-1)',
            }}
          >
            WeThePeople
          </span>
        </Link>

        <div style={{ width: '100%' }}>{children}</div>

        {footer && <div style={{ width: '100%' }}>{footer}</div>}
      </div>
    </div>
  );
}

/**
 * Labeled input field used inside the AuthShell card. Matches the design's
 * uppercase label + focus-gold border treatment. Supports helper/error text
 * below the field.
 */
interface AuthFieldProps {
  label: string;
  type?: string;
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  helper?: string;
  error?: string;
  required?: boolean;
  autoComplete?: string;
  minLength?: number;
  maxLength?: number;
}

export function AuthField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  helper,
  error,
  required,
  autoComplete,
  minLength,
  maxLength,
}: AuthFieldProps) {
  const [focus, setFocus] = React.useState(false);
  const borderColor = error
    ? 'var(--color-red)'
    : focus
      ? 'var(--color-accent)'
      : 'var(--color-border)';
  return (
    <div style={{ marginBottom: 14 }}>
      <label
        style={{
          display: 'block',
          fontFamily: "'Inter', sans-serif",
          fontSize: 11,
          fontWeight: 600,
          color: 'var(--color-text-2)',
          letterSpacing: '0.04em',
          textTransform: 'uppercase',
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete={autoComplete}
        minLength={minLength}
        maxLength={maxLength}
        onFocus={() => setFocus(true)}
        onBlur={() => setFocus(false)}
        style={{
          width: '100%',
          padding: '11px 14px',
          borderRadius: 8,
          background: 'var(--color-surface)',
          color: 'var(--color-text-1)',
          fontFamily: "'Inter', sans-serif",
          fontSize: 14,
          border: `1.5px solid ${borderColor}`,
          outline: 'none',
          transition: 'border-color 0.15s',
        }}
      />
      {helper && !error && (
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            color: 'var(--color-text-3)',
            marginTop: 5,
          }}
        >
          {helper}
        </div>
      )}
      {error && (
        <div
          style={{
            fontFamily: "'Inter', sans-serif",
            fontSize: 11,
            color: 'var(--color-red)',
            marginTop: 5,
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
