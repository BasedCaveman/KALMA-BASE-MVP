//kalma/frontend/components/shared/CityPill.tsx
'use client';

import Link from 'next/link';
import type { CSSProperties } from 'react';
import { useColors } from '@/hooks/useColors';

type CityPillProps = {
  label: string;
  href?: string;
  title?: string;
  muted?: boolean;
};

export default function CityPill({
  label,
  href,
  title,
  muted = false,
}: CityPillProps) {
  const { C, fonts, R } = useColors();

  const style: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 'fit-content',
    maxWidth: '154px',
    flexShrink: 0,
    minHeight: 30,
    padding: '6px 12px',
    borderRadius: R.pill,
    border: `1px solid ${C.divider}`,
    background: muted ? 'transparent' : C.surfaceSoft,
    boxShadow: muted
      ? 'none'
      : `2px 2px 5px ${C.shadowA}55, -1px -1px 3px ${C.shadowB}55`,
    color: muted ? C.textMuted : C.textSoft,
    fontFamily: fonts.mono,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.2,
    lineHeight: 1,
    textDecoration: 'none',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  };

  if (!href) {
    return (
      <span title={title ?? label} style={style}>
        {label}
      </span>
    );
  }

  return (
    <Link href={href} title={title ?? label} style={style}>
      {label}
    </Link>
  );
}
