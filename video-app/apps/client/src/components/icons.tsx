import React from 'react';

type IconProps = React.SVGProps<SVGSVGElement>;

function base(props: IconProps) {
  return {
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    ...props,
  };
}

export function MicIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
      <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function MicOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 9v3a3 3 0 0 0 5.12 2.12M15 9.34V5a3 3 0 0 0-5.94-.6" />
      <path d="M17 16.95A7 7 0 0 1 5 12v-2" />
      <path d="M19 10v1a7 7 0 0 1-.11 1.23" />
      <path d="m2 2 20 20" />
      <path d="M12 19v3" />
    </svg>
  );
}

export function VideoOnIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M15 10l4.55-2.28A1 1 0 0 1 21 8.62v6.76a1 1 0 0 1-1.45.9L15 13.2" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

export function VideoOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 10l4.55-2.28A1 1 0 0 1 23 8.62v6.76a1 1 0 0 1-1.45.9L17 13.2" />
      <rect x="3" y="6" width="12" height="12" rx="2" />
      <path d="m2.5 2.5 19 19" />
    </svg>
  );
}

export function PhoneOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a1 1 0 0 1 1.11-.21 11.9 11.9 0 0 0 1.73.5 1 1 0 0 1 .8.97v2.58a1 1 0 0 1-1 1A17.93 17.93 0 0 1 3 6.57a1 1 0 0 1 1-1H6.6a1 1 0 0 1 .97.8 11.9 11.9 0 0 0 .5 1.73 1 1 0 0 1-.21 1.11L7.05 9.51a16 16 0 0 0 3.63 3.8Z" />
      <path d="m22 2 2 2" />
    </svg>
  );
}

export function CameraOffIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 11V8a1 1 0 0 1 1-1h1" />
      <rect x="3" y="7" width="14" height="9" rx="2" />
      <circle cx="10" cy="11.5" r="2.2" />
      <path d="M4 5l16 16" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg {...base({ ...props, className: `animate-spin ${props.className ?? ''}` })}>
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M20 12a8 8 0 0 0-8-8" />
    </svg>
  );
}

export function AlertIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v4" />
      <path d="M12 16h.01" />
    </svg>
  );
}

export function UserIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="m16 17 5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function ArrowBackIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m12 19-7-7 7-7" />
      <path d="M19 12H5" />
    </svg>
  );
}

export function ReplayIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
    </svg>
  );
}