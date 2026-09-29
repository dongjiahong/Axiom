import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="64" height="64" rx="14" fill="#18181b" />
      <path
        d="M19 47 32 17 45 47"
        stroke="#fafafa"
        strokeWidth="5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M25 37h14" stroke="#fafafa" strokeWidth="5" strokeLinecap="round" />
      <circle cx="32" cy="16" r="5" fill="#818cf8" />
    </svg>
  );
}

export function Logo() {
  return (
    <div className="flex items-center gap-2">
      <LogoMark />
      <span className="text-base font-semibold tracking-tight">Axiom</span>
    </div>
  );
}
