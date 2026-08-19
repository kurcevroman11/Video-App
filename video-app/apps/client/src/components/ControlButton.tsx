import React from 'react';

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
  size?: 'md' | 'lg';
  showLabel?: boolean;
  highlight?: boolean;
}

export function ControlButton({
  label,
  onClick,
  active = true,
  danger = false,
  disabled = false,
  children,
  size = 'md',
  showLabel = false,
  highlight = false,
}: ControlButtonProps) {
  const dim = size === 'lg' ? 'h-14 w-14' : 'h-12 w-12';
  const iconSize = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5';

  const base =
    'flex items-center justify-center rounded-full transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 disabled:cursor-not-allowed min-w-[44px] min-h-[44px]';

  const style: React.CSSProperties = {
    color: danger ? '#fff' : active ? 'var(--color-text)' : '#fff',
    background: danger
      ? 'var(--color-danger)'
      : highlight
        ? 'var(--color-accent)'
        : active
          ? 'rgba(255,255,255,0.10)'
          : 'rgba(255,255,255,0.05)',
    border: danger
      ? 'none'
      : `1px solid ${active ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)'}`,
  };

  return (
    <div className="flex flex-col items-center gap-1.5">
      <button
        type="button"
        aria-label={label}
        aria-pressed={!active && !danger}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={`${base} ${dim}`}
        style={style}
      >
        <span className={iconSize}>{children}</span>
      </button>
      {showLabel && <span className="text-xs text-muted">{label}</span>}
    </div>
  );
}
