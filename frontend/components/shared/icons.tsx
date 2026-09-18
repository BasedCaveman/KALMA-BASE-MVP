//kalma/frontend/components/shared/icons.tsx

'use client';

type IconProps = { size?: number; color?: string; strokeWidth?: number };

export const RainIcon = ({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/>
  </svg>
);

export const TempIcon = ({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M14 4v10.54a4 4 0 1 1-4 0V4a2 2 0 0 1 4 0Z"/>
  </svg>
);

export const SnowIcon = ({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2v20M4.93 4.93l14.14 14.14M2 12h20M4.93 19.07 19.07 4.93"/>
    <path d="m9 5 3 3 3-3M9 19l3-3 3 3M5 9l3 3-3 3M19 9l-3 3 3 3"/>
  </svg>
);

export const WarningIcon = ({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3.5 22 20.5H2z"/>
    <path d="M12 10v4.2"/>
    <circle cx="12" cy="17.4" r="0.9" fill={color} stroke="none"/>
  </svg>
);

export const StormIcon = ({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <path d="M7.5 15.5a4.5 4.5 0 0 1 .8-8.94 6 6 0 0 1 11.4 2.2A4 4 0 0 1 18.5 16.5H8Z"/>
    <path d="M13 13.5l-2.5 4h2.2l-1.7 4.5 4.3-6h-2.2z"/>
  </svg>
);

export const WindIcon = ({ size = 16, color = 'currentColor', strokeWidth = 1.8 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M3 8h11a3 3 0 1 0-3-3"/>
    <path d="M3 12.5h14a3 3 0 1 1-3 3"/>
    <path d="M3 17h8a2.5 2.5 0 1 1-2.5 2.5"/>
  </svg>
);

export const ClockIcon = ({ size = 12, color = 'currentColor', strokeWidth = 2 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>
  </svg>
);

export const UsersIcon = ({ size = 14, color = 'currentColor', strokeWidth = 1.5 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);

export const WalletIcon = ({ size = 14, color = 'currentColor', strokeWidth = 1.5 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 3v4M8 3v4"/>
  </svg>
);

export const ArrowLeftIcon = ({ size = 20, color = 'currentColor', strokeWidth = 2 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
    <path d="M19 12H5M12 19l-7-7 7-7"/>
  </svg>
);

export const SunIcon = ({ size = 20, color = 'currentColor', strokeWidth = 1.5 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <path d="M12 2v4M12 18v4M4 12H2M22 12h-2M6.34 6.34L4.93 4.93M19.07 4.93l-1.41 1.41M6.34 17.66l-1.41 1.41M19.07 19.07l-1.41-1.41"/>
    <circle cx="12" cy="12" r="4"/>
  </svg>
);

export const MoonIcon = ({
  size = 16,
  color = 'currentColor',
  strokeWidth = 1.6,
  phase = 'full',
}: IconProps & { phase?: 'new' | 'waxing' | 'full' | 'waning' }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <circle cx="12" cy="12" r="9" />
    {phase === 'full' ? <circle cx="12" cy="12" r="9" fill={color} stroke="none" /> : null}
    {phase === 'waxing' ? <path d="M12 3a9 9 0 0 1 0 18Z" fill={color} stroke="none" /> : null}
    {phase === 'waning' ? <path d="M12 3a9 9 0 0 0 0 18Z" fill={color} stroke="none" /> : null}
  </svg>
);

export const ActivityIcon = ({ size = 20, color = 'currentColor', strokeWidth = 1.5 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth}>
    <path d="M2 12h2l3-9 4 18 4-12 2 3h5"/>
  </svg>
);

export function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  if (type === 'rain') return <RainIcon size={size} />;
  if (type === 'snow') return <SnowIcon size={size} />;
  return <TempIcon size={size} />;
}
