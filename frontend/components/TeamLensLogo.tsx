import Link from "next/link";

type TeamLensLogoProps = {
  href?: string;
  compact?: boolean;
  className?: string;
  markClassName?: string;
  textClassName?: string;
};

export default function TeamLensLogo({
  href,
  compact = false,
  className = "",
  markClassName = "",
  textClassName = "",
}: TeamLensLogoProps) {
  const content = (
    <>
      <span
        className={`tl-brand-mark shrink-0 ${markClassName}`}
        aria-hidden="true"
      >
        <span></span>
        <span></span>
        <span></span>
        <span></span>
      </span>
      {!compact && (
        <span className={`text-[22px] font-medium tracking-tight text-[#2D2A26] ${textClassName}`}>
          TeamLens
        </span>
      )}
    </>
  );

  const classes = `inline-flex items-center gap-3 ${className}`.trim();

  if (href) {
    return (
      <Link href={href} className={classes} aria-label="TeamLens">
        {content}
      </Link>
    );
  }

  return (
    <div className={classes} aria-label="TeamLens">
      {content}
    </div>
  );
}
