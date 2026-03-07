'use client';

/**
 * PabloLogo — The Pablo "Convergence" mark.
 * Three overlapping planes forming a P with layered depth.
 * Renders inline SVG so it inherits sizing and can animate.
 *
 * Sizes: 'sm' (18px, TopBar), 'md' (32px, HeroPrompt), 'lg' (56px, Login)
 */

interface PabloLogoProps {
  size?: 'sm' | 'md' | 'lg' | number;
  className?: string;
  animate?: boolean;
}

const SIZES = { sm: 18, md: 32, lg: 56 };

export function PabloLogo({ size = 'sm', className = '', animate = false }: PabloLogoProps) {
  const px = typeof size === 'number' ? size : SIZES[size];

  return (
    <svg
      width={px}
      height={px}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label="Pablo logo"
    >
      <defs>
        <linearGradient id={`pbl-g-${px}`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F0D070" />
          <stop offset="40%" stopColor="#D4A843" />
          <stop offset="100%" stopColor="#A07828" />
        </linearGradient>
        <linearGradient id={`pbl-l-${px}`} x1="12" y1="10" x2="48" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCEABB" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#D4A843" stopOpacity="0" />
        </linearGradient>
      </defs>

      {/* Background */}
      <rect width="64" height="64" rx="14" fill="#0D1017" />

      {/* P base layer */}
      <path
        d="M 18 12 L 40 12 C 51 12, 54 21, 54 27 C 54 34, 49 39, 40 39 L 26 39 L 26 52 L 18 52 Z"
        fill={`url(#pbl-g-${px})`}
        opacity="0.6"
      />

      {/* P counter (negative space) */}
      <path
        d="M 26 19 L 37 19 C 44 19, 46 23, 46 27 C 46 31, 43 33, 37 33 L 26 33 Z"
        fill="#0D1017"
      />

      {/* Stem highlight */}
      <rect x="20" y="15" width="4" height="34" rx="1.5" fill={`url(#pbl-l-${px})`} opacity="0.6" />

      {/* Bowl highlight */}
      <path
        d="M 28 20 L 36 20 C 42 20, 44 23, 44 27 C 44 30, 42 32, 36 32 L 28 32 L 28 28 L 34 28 C 36 28, 37 27, 37 26 C 37 25, 36 24, 34 24 L 28 24 Z"
        fill={`url(#pbl-l-${px})`}
      />

      {/* Animated glow pulse on the P bowl */}
      {animate && (
        <path
          d="M 28 20 L 36 20 C 42 20, 44 23, 44 27 C 44 30, 42 32, 36 32 L 28 32 L 28 28 L 34 28 C 36 28, 37 27, 37 26 C 37 25, 36 24, 34 24 L 28 24 Z"
          fill="none"
          stroke="#D4A843"
          strokeWidth="1"
          opacity="0"
        >
          <animate attributeName="opacity" values="0;0.5;0" dur="3s" repeatCount="indefinite" />
        </path>
      )}
    </svg>
  );
}
