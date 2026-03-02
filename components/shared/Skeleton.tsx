'use client';

interface SkeletonProps {
  className?: string;
  lines?: number;
  lineHeight?: number;
}

export function Skeleton({ className = '', lines = 1, lineHeight = 16 }: SkeletonProps) {
  if (lines === 1) {
    return <div className={`animate-shimmer rounded ${className}`} style={{ height: lineHeight }} />;
  }

  return (
    <div className="flex flex-col gap-2">
      {Array.from({ length: lines }, (_, i) => (
        <div
          key={i}
          className={`animate-shimmer rounded ${className}`}
          style={{
            height: lineHeight,
            width: i === lines - 1 ? '60%' : '100%',
          }}
        />
      ))}
    </div>
  );
}
