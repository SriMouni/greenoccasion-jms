/** Green Occasion brand mark (sprout-in-a-pot) + optional wordmark. Served from /logo.png. */
export const Logo = ({
  size = 28,
  wordmark = true,
  subtitle,
  className = '',
}: {
  size?: number;
  wordmark?: boolean;
  subtitle?: string;
  className?: string;
}) => (
  <div className={`flex items-center gap-2 ${className}`}>
    <img src="/logo.png" alt="Green Occasion" width={size} height={size} className="shrink-0" style={{ width: size, height: size }} />
    {wordmark && (
      <div className="leading-tight">
        <p className="font-serif text-lg font-bold text-on-surface">Green Occasion</p>
        {subtitle && (
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-on-surface-variant">{subtitle}</p>
        )}
      </div>
    )}
  </div>
);
