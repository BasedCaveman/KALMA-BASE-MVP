'use client';

export default function MaterialFilters() {
  return (
    <svg width="0" height="0" style={{ position: 'absolute' }}>
      <defs>
        {/* Rubber micro-porosity — buttons & interactive elements */}
        <filter id="rubber" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="1.2" numOctaves="4" seed="2" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
          <feComponentTransfer in="mono" result="pores">
            <feFuncA type="linear" slope="0.06" intercept="0"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="SourceGraphic"/>
            <feMergeNode in="pores"/>
          </feMerge>
        </filter>
        {/* Background grain */}
        <filter id="grain-bg" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" seed="5" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
          <feComponentTransfer in="mono" result="grain">
            <feFuncA type="linear" slope="0.035" intercept="0"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="SourceGraphic"/>
            <feMergeNode in="grain"/>
          </feMerge>
        </filter>
        {/* Card surface porosity */}
        <filter id="card-surface" x="-2%" y="-2%" width="104%" height="104%">
          <feTurbulence type="fractalNoise" baseFrequency="2" numOctaves="5" seed="8" stitchTiles="stitch" result="noise"/>
          <feColorMatrix type="saturate" values="0" in="noise" result="mono"/>
          <feComponentTransfer in="mono" result="micro">
            <feFuncA type="linear" slope="0.04" intercept="0"/>
          </feComponentTransfer>
          <feMerge>
            <feMergeNode in="SourceGraphic"/>
            <feMergeNode in="micro"/>
          </feMerge>
        </filter>
      </defs>
    </svg>
  );
}
