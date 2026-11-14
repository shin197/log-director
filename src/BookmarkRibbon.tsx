import type { ReactNode } from 'react';

export function BookmarkRibbon({
  children,
  className = '',
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`bookmark-ribbon ${className}`.trim()}>
      <svg
        className="bookmark-ribbon-bg"
        viewBox="0 0 32 42"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <path
          d="M0 0 H32 V42 L16 33 L0 42 Z"
          fill="currentColor"
          stroke="#6b4c00"
          strokeWidth="2"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
      <span className="bookmark-ribbon-content">{children}</span>
    </span>
  );
}
