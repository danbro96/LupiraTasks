// Tiny inline SVG icons. Stroke uses currentColor so CSS controls color.

interface IconProps {
  size?: number;
  className?: string;
}

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
}

export function ChevronRightIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <polyline points="9 18 15 12 9 6" />
    </svg>
  );
}

export function GripIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className} strokeWidth={1.5}>
      <circle cx="9" cy="6" r="1" />
      <circle cx="9" cy="12" r="1" />
      <circle cx="9" cy="18" r="1" />
      <circle cx="15" cy="6" r="1" />
      <circle cx="15" cy="12" r="1" />
      <circle cx="15" cy="18" r="1" />
    </svg>
  );
}

export function TrashIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}

export function CloseIcon({ size = 22, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}
