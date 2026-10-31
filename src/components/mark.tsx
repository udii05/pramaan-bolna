export function PramaanMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 44 44" fill="none" className={className} aria-hidden="true">
      <circle cx="22" cy="22" r="19" fill="currentColor" opacity="0.1" />
      <circle cx="22" cy="22" r="19" stroke="currentColor" strokeWidth="2" />
      <circle cx="22" cy="22" r="14.5" stroke="currentColor" strokeWidth="1" opacity="0.45" />
      <path
        d="M22 1.4v4.2M22 38.4v4.2M1.4 22h4.2M38.4 22h4.2M7.6 7.6l3 3M33.4 33.4l3 3M36.4 7.6l-3 3M10.6 33.4l-3 3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M14.4 22.6l5.1 5.1 10.1-11.6"
        stroke="currentColor"
        strokeWidth="3.1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
