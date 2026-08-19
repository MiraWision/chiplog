import Link from "next/link";

import { NPM, REPO, SITE_NAME } from "@/lib/site";

function Mark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <rect width="32" height="32" rx="7" fill="var(--color-brand)" />
      <path
        d="M6 7c0 6 4 9 10 11.5"
        stroke="var(--color-brand-ink)"
        strokeWidth="2"
        strokeLinecap="round"
        opacity="0.85"
      />
      <circle cx="9.5" cy="9.8" r="1.5" fill="var(--color-brand-ink)" />
      <circle cx="13.4" cy="13.6" r="1.5" fill="var(--color-brand-ink)" />
      <path d="M17.5 18.5h8v7h-8z" fill="var(--color-brand-ink)" />
    </svg>
  );
}

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-[var(--color-line)] bg-[color-mix(in_oklab,var(--color-canvas)_88%,transparent)] backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-6 px-5">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <Mark />
          {SITE_NAME}
        </Link>
        <nav className="flex items-center gap-5 text-sm text-[var(--color-muted)]">
          <Link href="/docs/" className="hover:text-[var(--color-ink)]">
            Docs
          </Link>
          <a href={REPO} className="hover:text-[var(--color-ink)]">
            GitHub
          </a>
          <a href={NPM} className="hover:text-[var(--color-ink)]">
            npm
          </a>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-[var(--color-line)]">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-10 text-sm text-[var(--color-muted)] sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-md">
          A <strong className="font-medium text-[var(--color-ink-2)]">chip log</strong> was a board
          on a knotted rope, thrown astern to record a ship&rsquo;s progress. Its readings went into
          the log book — which is where the word in your terminal comes from.
        </p>
        <p>
          MIT ·{" "}
          <a href={REPO} className="hover:text-[var(--color-ink)]">
            GitHub
          </a>{" "}
          ·{" "}
          <a href={NPM} className="hover:text-[var(--color-ink)]">
            npm
          </a>
        </p>
      </div>
    </footer>
  );
}
