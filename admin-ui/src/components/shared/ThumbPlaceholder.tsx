const SVG = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <rect x="3" y="3" width="18" height="18" rx="3" />
    <circle cx="8.5" cy="8.5" r="1.5" />
    <path d="M21 15l-5-5L5 21" />
  </svg>
);

export function ThumbPlaceholder({ className = 'recent-thumb recent-thumb-placeholder' }: { className?: string }) {
  return (
    <div className={className} aria-hidden="true">
      {SVG}
    </div>
  );
}

export function PcardImgPlaceholder() {
  return (
    <div className="pcard-img-placeholder">
      {SVG}
    </div>
  );
}

export function BundleThumbPlaceholder() {
  return (
    <div className="bundle-item-thumb-ph">
      {SVG}
    </div>
  );
}
