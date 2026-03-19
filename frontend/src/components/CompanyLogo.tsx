import React, { useState, useCallback } from 'react';
import { Building2 } from 'lucide-react';
import { getLogoUrl, getInitials } from '../utils/logos';

interface CompanyLogoProps {
  /** Company or institution ID (e.g. "goldman-sachs") */
  id: string;
  /** Display name for alt text and initials fallback */
  name: string;
  /** logo_url from API response */
  logoUrl?: string | null;
  /** Set of IDs with local logo files in /public/logos/ */
  localLogos?: Set<string>;
  /** Size in pixels (applies to both width and height) */
  size?: number;
  /** CSS class name for the outer container */
  className?: string;
  /** Background color for the initials fallback */
  fallbackBg?: string;
  /** Text color for the initials fallback */
  fallbackColor?: string;
  /** Whether to show a Building2 icon instead of initials when no logo */
  iconFallback?: boolean;
}

/**
 * Reusable company logo component with automatic Google favicon fallback.
 * Falls through: local file -> API logo_url -> Google Favicons (128px) -> initials/icon.
 */
export default function CompanyLogo({
  id,
  name,
  logoUrl,
  localLogos,
  size = 44,
  className = '',
  fallbackBg = 'rgba(255,255,255,0.05)',
  fallbackColor = 'rgba(255,255,255,0.6)',
  iconFallback = false,
}: CompanyLogoProps) {
  const resolvedUrl = getLogoUrl(id, logoUrl, localLogos);
  const [imgError, setImgError] = useState(false);

  const handleError = useCallback(() => {
    setImgError(true);
  }, []);

  const containerStyle: React.CSSProperties = {
    width: size,
    height: size,
    minWidth: size,
    minHeight: size,
  };

  // If we have a URL and it hasn't errored, show the image
  if (resolvedUrl && !imgError) {
    return (
      <div
        className={`flex items-center justify-center overflow-hidden rounded-lg bg-[#111111] border border-white/5 ${className}`}
        style={containerStyle}
      >
        <img
          src={resolvedUrl}
          alt={name}
          onError={handleError}
          className="object-contain"
          style={{
            width: Math.round(size * 0.7),
            height: Math.round(size * 0.7),
          }}
          loading="lazy"
        />
      </div>
    );
  }

  // Fallback: icon or initials
  if (iconFallback) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-white/5 ${className}`}
        style={{ ...containerStyle, backgroundColor: fallbackBg }}
      >
        <Building2 size={Math.round(size * 0.45)} className="text-white/20" />
      </div>
    );
  }

  return (
    <div
      className={`flex items-center justify-center rounded-lg font-heading font-bold border border-white/5 ${className}`}
      style={{
        ...containerStyle,
        backgroundColor: fallbackBg,
        color: fallbackColor,
        fontSize: Math.round(size * 0.3),
      }}
    >
      {getInitials(name)}
    </div>
  );
}
