import Link from "next/link";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <rect x="6" y="6" width="20" height="20" rx="2" fill="none" stroke="var(--agent)" strokeWidth="2" />
      <rect x="6" y="6" width="20" height="20" rx="2" fill="none" stroke="var(--biz)" strokeWidth="2" transform="rotate(45 16 16)" />
      <circle cx="16" cy="16" r="3" fill="var(--foreground)" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2 rounded-lg focus-visible:outline-2 focus-visible:outline-ring">
      <LogoMark />
      <span className="whitespace-nowrap font-display text-lg font-bold tracking-tight">
        Botir <span className="text-agent">AI</span>
      </span>
    </Link>
  );
}
