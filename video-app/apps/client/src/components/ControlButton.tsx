import React from 'react';

interface ControlButtonProps {
  label: string;
  onClick: () => void;
  active?: boolean;
  danger?: boolean;
  children: React.ReactNode;
  disabled?: boolean;
}

export function ControlButton({
  label,
  onClick,
  active = true,
  danger = false,
  disabled = false,
  children,
}: ControlButtonProps) {
  const base =
    'flex h-full w-full items-center justify-center rounded-full transition-all duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/60 disabled:opacity-50 disabled:cursor-not-allowed';

  // работает через классы Tailwind v4
  const style: React.CSSProperties = {
    minWidth: 44,
    minHeight: 44,
    width: 56,
    height: 56,
    color: danger ? '#fff' : active ? 'var(--color-text)' : '#fff',
    background: danger
      ? 'var(--color-danger)'
      : active
        ? 'rgba(255,255,255,0.08)'
        : 'rgba(255,255,255,0.04)',
    border: danger ? 'none' : `1px solid ${active ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.06)'}`,
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        type="button"
        aria-label={label}
        title={label}
        onClick={onClick}
        disabled={disabled}
        className={base}
        style={style}
      >
        {children}
      </button>
      <span className="text-xs text-muted">{label}</span>
    </div>
  );
}