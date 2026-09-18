'use client';

import { C } from './palette';

export default function CrackleEdge() {
  return (
    <svg
      style={{
        position: 'absolute', top: -1, left: -1, right: -1, bottom: -1,
        width: 'calc(100% + 2px)', height: 'calc(100% + 2px)',
        pointerEvents: 'none',
      }}
      xmlns="http://www.w3.org/2000/svg"
      preserveAspectRatio="none"
    >
      <defs>
        <filter id="crackle-f">
          <feTurbulence type="turbulence" baseFrequency="0.04 0.15" numOctaves="3" seed="12" result="warp"/>
          <feDisplacementMap in="SourceGraphic" in2="warp" scale="3" xChannelSelector="R" yChannelSelector="G"/>
        </filter>
      </defs>
      <rect
        x="1" y="1"
        width="calc(100% - 2px)" height="calc(100% - 2px)"
        rx="20" ry="20"
        fill="none"
        stroke={C.shadowA}
        strokeWidth="0.5"
        opacity="0.35"
        filter="url(#crackle-f)"
      />
    </svg>
  );
}
