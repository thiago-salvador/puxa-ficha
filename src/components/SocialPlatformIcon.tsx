export function SocialPlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === "linkedin") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
        <path d="M6.5 8.5H3V21h3.5V8.5ZM4.75 3A2.25 2.25 0 1 0 4.75 7.5 2.25 2.25 0 0 0 4.75 3ZM21 13.83c0-3.77-2.01-5.53-4.69-5.53-2.16 0-3.13 1.19-3.67 2.03V8.5H9.15V21h3.49v-6.19c0-1.63.31-3.2 2.33-3.2 2 0 2.03 1.86 2.03 3.31V21H21v-7.17Z" />
      </svg>
    )
  }
  if (platform === "twitter") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24h-6.657l-5.214-6.817-5.963 6.817H1.684l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231Zm-1.161 17.52h1.833L7.084 4.126H5.117L17.083 19.77Z" />
      </svg>
    )
  }
  if (platform === "instagram") {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" className={className}>
        <rect x="3" y="3" width="18" height="18" rx="5" />
        <circle cx="12" cy="12" r="4" />
        <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
      </svg>
    )
  }
  if (platform === "github") {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={className}>
        <path d="M12 2.5a9.5 9.5 0 0 0-3 18.51c.48.09.65-.21.65-.46v-1.67c-2.65.58-3.21-1.12-3.21-1.12-.44-1.1-1.08-1.4-1.08-1.4-.87-.6.07-.59.07-.59.96.07 1.47.99 1.47.99.86 1.47 2.26 1.05 2.81.8.09-.62.34-1.05.61-1.29-2.12-.24-4.35-1.06-4.35-4.72 0-1.04.37-1.89.98-2.56-.1-.24-.43-1.21.09-2.52 0 0 .8-.26 2.62.98a9.1 9.1 0 0 1 4.77 0c1.82-1.24 2.62-.98 2.62-.98.52 1.31.19 2.28.09 2.52.61.67.98 1.52.98 2.56 0 3.67-2.23 4.48-4.36 4.71.35.3.65.87.65 1.76v2.61c0 .25.17.55.66.46A9.5 9.5 0 0 0 12 2.5Z" />
      </svg>
    )
  }
  return null
}
