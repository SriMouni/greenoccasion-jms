import type { ReactNode } from 'react';

/** Shared dashboard stat card used across author/editor/reviewer dashboards. */
export const StatCard = ({
  label,
  value,
  hint,
  onClick,
  active,
}: {
  label: string;
  value: number | string;
  hint?: ReactNode;
  onClick?: () => void;
  active?: boolean;
}) => {
  const body = (
    <>
      <p className="text-xs font-semibold uppercase tracking-wide text-on-surface-variant">{label}</p>
      <p className="mt-1 font-serif text-3xl text-on-surface">
        {typeof value === 'number' ? String(value).padStart(2, '0') : value}
      </p>
      {hint && <p className="mt-1 text-xs text-on-surface-variant">{hint}</p>}
    </>
  );
  const base = `rounded-lg border px-5 py-4 text-left ${
    active ? 'border-primary bg-primary/5' : 'border-outline-variant bg-surface-container-lowest'
  }`;
  return onClick ? (
    <button type="button" onClick={onClick} className={`${base} transition hover:border-primary`}>
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
};
