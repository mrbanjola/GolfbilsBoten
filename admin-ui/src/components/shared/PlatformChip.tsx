const PLATFORM_CLASS: Record<string, string> = {
  blocket: 'chip-blue',
  tradera: 'chip-amber',
  klaravik: 'chip-green',
  blinto: 'chip-slate',
  auctionet: 'chip-green',
  budi: 'chip-amber',
  junora: 'chip-slate',
  facebook: 'chip-blue',
};

export function platformChipClass(platform: string) {
  return PLATFORM_CLASS[platform] ?? 'chip-slate';
}

export function PlatformChip({ platform, className = '', style }: { platform: string; className?: string; style?: React.CSSProperties }) {
  return (
    <span className={`chip ${platformChipClass(platform)} recent-platform ${className}`} style={style}>
      {platform}
    </span>
  );
}
