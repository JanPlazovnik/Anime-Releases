export function Logo({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 36 36" aria-hidden className={className}>
      <rect width="36" height="36" rx="10" className="fill-primary" />
      <g fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="9" y="11" width="18" height="16" rx="3" />
        <path d="M14 8.5V13M22 8.5V13" />
      </g>
      <path d="M15.5 15.5 22 19l-6.5 3.5z" fill="white" stroke="white" strokeWidth="1" strokeLinejoin="round" />
    </svg>
  );
}
